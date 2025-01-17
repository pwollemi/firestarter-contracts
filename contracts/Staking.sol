// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/// @title Firestarter Staking Contract
/// @author Daniel Lee
/// @notice You can use this contract for staking LP tokens
/// @dev All function calls are currently implemented without side effects
contract Staking is Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeCastUpgradeable for int256;
    using SafeCastUpgradeable for uint256;

    /// @notice Info of each user.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of FLAME entitled to the user.
    /// `lastDepositedAt` The timestamp of the last deposit.
    struct UserInfo {
        uint256 amount;
        int256 rewardDebt;
        uint256 lastDepositedAt;
    }

    uint256 private constant ACC_FLAME_PRECISION = 1e12;

    /// @notice Address of FLAME contract.
    IERC20Upgradeable public FLAME;

    /// @notice Address of the LP token.
    IERC20Upgradeable public lpToken;

    /********************** Staking params ***********************/

    /// @notice Start time of staking
    uint256 public startTime;

    /// @notice Duration for unstake/claim penalty
    uint256 public earlyWithdrawal;

    /// @notice Full staking period
    uint256 public stakingPeriod;

    /// @notice Amount of FLAME token allocated per second.
    uint256 public flamePerSecond;

    /********************** Staking status ***********************/

    // Total reward amount of previous staking periods.
    uint256 private accTotalRewards;

    // Total reward debt in current staking period. Updated when flamePerSecond is updated.
    int256 private totalRewardDebt;

    /// @notice FLAME reward amount allocated per LP token.
    uint256 public accFlamePerShare;

    /// @notice Last time that the reward is calculated.
    uint256 public lastRewardTime;

    /// @notice Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;

    /// @notice Lock expire time for a wallet
    mapping(address => uint256) public lockExpiresAt;

    /// @notice Worker's address allowed to set lock period
    address public worker;

    /**
     * @dev Throws if called by any account other than the owner or the worker.
     */
    modifier onlyOwnerOrWorker() {
        require(owner() == _msgSender() || worker == _msgSender(), "Staking: caller is not the owner nor the worker");
        _;
    }

    event Deposit(address indexed user, uint256 amount, address indexed to);
    event Withdraw(address indexed user, uint256 amount, address indexed to);
    event EmergencyWithdraw(address indexed user, uint256 amount, address indexed to);
    event Harvest(address indexed user, uint256 amount);

    event LogUpdatePool(uint256 lastRewardTime, uint256 lpSupply, uint256 accFlamePerShare);
    event LogFlamePerSecond(uint256 flamePerSecond);
    event LogStakingInfo(uint256 startTime, uint256 stakingPeriod);
    event LogEarlyWithdrawal(uint256 earlyWithdrawal);
    event LockExpiresAt(address indexed wallet, uint256 timestamp);

    /**
     * @param _flame The FLAME token contract address.
     * @param _lpToken The LP token contract address.
     * @param _startTime The staking start time.
     */
    function initialize(
        IERC20Upgradeable _flame,
        IERC20Upgradeable _lpToken,
        uint256 _startTime
    ) external initializer {
        require(address(_flame) != address(0), "initialize: FLAME token address cannot be zero");
        require(address(_lpToken) != address(0), "initialize: LP token address cannot be zero");
        require(
            _startTime > block.timestamp,
            "initialize: staking start time must be in the future"
        );

        __Ownable_init();

        FLAME = _flame;
        lpToken = _lpToken;
        accFlamePerShare = 0;
        startTime = _startTime;
        lastRewardTime = _startTime;

        earlyWithdrawal = 30 days;
        stakingPeriod = 90 days;
    }

    /**
     * @notice Set the earlyWithdrawal
     * @param _earlyWithdrawal The new earlyWithdrawal
     */
    function setEarlyWithdrawal(uint256 _earlyWithdrawal) external onlyOwner {
        require(
            stakingPeriod > _earlyWithdrawal,
            "setEarlyWithdrawal: early withdrawal should be shorter than staking period"
        );
        earlyWithdrawal = _earlyWithdrawal;
        emit LogEarlyWithdrawal(_earlyWithdrawal);
    }

    /**
     * @notice Set the stakingPeriod
     * @dev There are two cases.
     *  1. Reset start time before staking starts
     *  2. Start another staking after current one ends
     *  In case 2, before updating startTime and stakingPeriod,
     *  we should distribute rewards first.
     *
     *  You must update lastRewardTime
     *
     * @param _startTime Staking start time
     * @param _stakingPeriod The new stakingPeriod
     */
    function setStakingInfo(uint256 _startTime, uint256 _stakingPeriod) external onlyOwner {
        require(!isStakingInProgress(), "setStakingInfo: Staking is in progress");
        require(_startTime > block.timestamp, "setStakingInfo: Should be time in future");

        // if this is setting new staking period
        if (isStakingEnded()) {
            accTotalRewards = totalRewards();
            totalRewardDebt = 0;
        }

        updatePool();
        startTime = _startTime;
        stakingPeriod = _stakingPeriod;
        lastRewardTime = _startTime;

        emit LogStakingInfo(_startTime, _stakingPeriod);
    }

    /**
     * @notice Sets the flame per second to be distributed. Can only be called by the owner.
     * @dev Its decimals count is ACC_FLAME_PRECISION
     * @param _flamePerSecond The amount of Flame to be distributed per second.
     */
    function setFlamePerSecond(uint256 _flamePerSecond) public onlyOwner {
        if (isStakingInProgress()) {
            totalRewardDebt =
                totalRewardDebt +
                (_flamePerSecond.toInt256() - flamePerSecond.toInt256()) *
                (block.timestamp - startTime).toInt256();
        }
        if (isStakingEnded()) {
            accTotalRewards = totalRewards();
            totalRewardDebt = (_flamePerSecond * stakingPeriod).toInt256();
        }

        updatePool();
        flamePerSecond = _flamePerSecond;
        emit LogFlamePerSecond(_flamePerSecond);
    }

    /**
     * @notice View function to return total rewards of all staking periods.
     * @dev total rewards = claimedRewards + remaining reward balance
     *
     *  This means that the all deposited rewards to this contract must be distributed.
     *  Thus, it should be the same with sum of flamePerSecond * stakingPeriod in all staking periods.
     *  If not, this function doesn't return the correct reward amount.
     *
     * @return total rewards of all staking periods.
     */
    function totalRewards() public view returns (uint256 total) {
        total = accTotalRewards;
        total = _toUint256((total + flamePerSecond * stakingPeriod).toInt256() - totalRewardDebt);
    }

    /**
     * @notice View function to see pending FLAME on frontend.
     * @dev It doens't update accFlamePerShare, it's just a view function.
     *
     *  pending flame = (user.amount * pool.accFlamePerShare) - user.rewardDebt
     *
     * @param _user Address of user.
     * @return pending FLAME reward for a given user.
     */
    function pendingFlame(address _user) external view returns (uint256 pending) {
        UserInfo storage user = userInfo[_user];
        uint256 lpSupply = lpToken.balanceOf(address(this));
        uint256 accFlamePerShare_ = accFlamePerShare;

        uint256 stakingEndTime = startTime + stakingPeriod;
        uint256 rewardTime = stakingEndTime < block.timestamp ? stakingEndTime : block.timestamp;
        if (rewardTime > lastRewardTime && lpSupply != 0) {
            uint256 time = rewardTime - lastRewardTime;
            uint256 flameReward = time * flamePerSecond;
            accFlamePerShare_ =
                accFlamePerShare_ +
                ((flameReward * ACC_FLAME_PRECISION) / lpSupply);
        }
        pending = _toUint256(((user.amount * accFlamePerShare_) / ACC_FLAME_PRECISION).toInt256() -
            user.rewardDebt);
    }

    /**
     * @notice Update reward variables.
     * @dev Updates accFlamePerShare and lastRewardTime.
     *  This can be called in these timings.
     *  1. before startTime: lastRewardTime is startTime so no update
     *  2. staking in progress: it should work fine
     *  3. staking is ended
     *     - new staking params not set: it should work fine
     *     - new staking params are set: lastRewardTime is startTime and the reward is already calculated
     */
    function updatePool() public {
        uint256 stakingEndTime = startTime + stakingPeriod;
        uint256 rewardTime = stakingEndTime < block.timestamp ? stakingEndTime : block.timestamp;
        if (rewardTime > lastRewardTime) {
            uint256 lpSupply = lpToken.balanceOf(address(this));
            if (lpSupply > 0) {
                uint256 time = rewardTime - lastRewardTime;
                uint256 flameReward = time * flamePerSecond;
                accFlamePerShare =
                    accFlamePerShare +
                    ((flameReward * ACC_FLAME_PRECISION) / lpSupply);
            }
            lastRewardTime = rewardTime;
            emit LogUpdatePool(lastRewardTime, lpSupply, accFlamePerShare);
        }
    }

    /**
     * @notice Deposit LP tokens for FLAME allocation.
     * @param amount LP token amount to deposit.
     * @param to The receiver of `amount` deposit benefit.
     */
    function deposit(uint256 amount, address to) public {
        require(isStakingInProgress(), "Stake: Pool is not open");

        updatePool();
        UserInfo storage user = userInfo[to];

        // Effects
        user.lastDepositedAt = block.timestamp;
        user.amount = user.amount + amount;
        user.rewardDebt =
            user.rewardDebt +
            ((amount * accFlamePerShare) / ACC_FLAME_PRECISION).toInt256();

        emit Deposit(msg.sender, amount, to);

        lpToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw LP tokens and harvest rewards to `to`.
     * @param amount LP token amount to withdraw.
     * @param to Receiver of the LP tokens and FLAME rewards.
     */
    function withdraw(uint256 amount, address to) public {
        require(lockExpiresAt[msg.sender] <= block.timestamp, "Still in the lock period");

        updatePool();
        UserInfo storage user = userInfo[msg.sender];

        int256 accumulatedFlame = ((user.amount * accFlamePerShare) / ACC_FLAME_PRECISION)
            .toInt256();
        uint256 _pendingFlame = _toUint256(accumulatedFlame - user.rewardDebt);

        // Effects
        user.rewardDebt =
            accumulatedFlame -
            ((amount * accFlamePerShare) / ACC_FLAME_PRECISION).toInt256();
        user.amount = user.amount - amount;

        emit Withdraw(msg.sender, amount, to);
        emit Harvest(msg.sender, _pendingFlame);

        // Interactions
        if (isEarlyWithdrawl(user.lastDepositedAt)) {
            FLAME.safeTransfer(to, _pendingFlame / 2);
            FLAME.safeTransfer(address(0xdead), _pendingFlame / 2);
        } else {
            FLAME.safeTransfer(to, _pendingFlame);
        }

        lpToken.safeTransfer(to, amount);
    }

    /**
     * @notice Harvest rewards and send to `to`.
     * @dev Here comes the formula to calculate reward token amount
     * @param to Receiver of FLAME rewards.
     */
    function harvest(address to) public {
        require(lockExpiresAt[msg.sender] <= block.timestamp, "Still in the lock period");

        updatePool();
        UserInfo storage user = userInfo[msg.sender];


        int256 accumulatedFlame = ((user.amount * accFlamePerShare) / ACC_FLAME_PRECISION)
            .toInt256();
        uint256 _pendingFlame = _toUint256(accumulatedFlame - user.rewardDebt);

        // Effects
        user.rewardDebt = accumulatedFlame;

        emit Harvest(msg.sender, _pendingFlame);

        // Interactions
        if (_pendingFlame != 0) {
            if (isEarlyWithdrawl(user.lastDepositedAt)) {
                FLAME.safeTransfer(to, _pendingFlame / 2);
                FLAME.safeTransfer(address(0xdead), _pendingFlame / 2);
            } else {
                FLAME.safeTransfer(to, _pendingFlame);
            }
        }
    }

    /**
     * @notice Withdraw without caring about rewards. EMERGENCY ONLY.
     * @param to Receiver of the LP tokens.
     */
    function emergencyWithdraw(address to) public {
        UserInfo storage user = userInfo[msg.sender];
        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;

        emit EmergencyWithdraw(msg.sender, amount, to);

        // Note: transfer can fail or succeed if `amount` is zero.
        lpToken.safeTransfer(to, amount);
    }

    /**
     * @notice deposit reward
     * @param amount to deposit
     */
    function depositFLAME(uint256 amount) external onlyOwner {
        FLAME.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice withdraw reward
     * @param amount to withdraw
     */
    function withdrawFLAME(uint256 amount) external onlyOwner {
        FLAME.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice check if the staking is started
     * @return isStarted
     */
    function isStakingStarted() public view returns (bool isStarted) {
        isStarted = startTime != 0 && startTime <= block.timestamp;
    }

    /**
     * @notice check if the staking is ended
     * @return isEnded
     */
    function isStakingEnded() public view returns (bool isEnded) {
        isEnded = startTime != 0 && block.timestamp > (startTime + stakingPeriod);
    }

    /**
     * @notice check if staking in progress
     * @return isInProgress
     */
    function isStakingInProgress() public view returns (bool isInProgress) {
        isInProgress = isStakingStarted() && !isStakingEnded();
    }

    /**
     * @notice check if user in penalty period
     * @return isEarly
     */
    function isEarlyWithdrawl(uint256 lastDepositedTime) internal view returns (bool isEarly) {
        isEarly = block.timestamp <= lastDepositedTime + earlyWithdrawal;
    }

    function renounceOwnership() public override onlyOwner {
        revert();
    }

    /**
     * @notice Set worker
     * @param _worker worker's address
     */
    function setWorker(address _worker) external onlyOwner {
        worker = _worker;
    }

    /**
     * @notice Remove worker
     */
    function removeWorker() external onlyOwner {
        worker = address(0);
    }

    /**
     * @notice set lock expiring time of a wallet
     * @param wallet to set lock expiring time
     * @param timestamp of being unlocked
     */
    function setLockExpiresAt(address wallet, uint256 timestamp) external onlyOwnerOrWorker {
        _setLockExpiresAt(wallet, timestamp);
    }

    /**
     * @notice set lock period of several wallets
     * @param wallets to set lock period
     * @param timestamps of being unlocked
     */
    function setBatchLockExpiresAt(address[] memory wallets, uint256[] memory timestamps) external onlyOwnerOrWorker {
        require(wallets.length <= 100, "Input array length shouldn't exceed 100");
        for (uint256 i = 0; i < wallets.length; i = i + 1) {
            _setLockExpiresAt(wallets[i], timestamps[i]);
        }
    }

    function _setLockExpiresAt(address wallet, uint256 timestamp) internal {
        lockExpiresAt[wallet] = timestamp;
        emit LockExpiresAt(wallet, timestamp);
    }

    function _toUint256(int256 value) internal pure returns (uint256) {
        if (value < 0) return 0;
        return value.toUint256();
    }
}
