//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Firestarter Staking Contract
/// @author Ryan Jun, Daniel Lee
/// @notice Firestarter Staking Contract
/// @dev All function calls are currently implemented without side effects
contract StakingPool is  Initializable, ContextUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct StakeInfo {
        // Last stake time
        uint256 lastStakedAt;
        // Total staked amount
        uint256 total;
        // Last reward update time
        uint256 lastAccumulatedTime;
        // Accumulated stakes that can be used for reward calculation
        uint256 accumulatedStakes;
    }

    /// @notice Token to stake in the pool : FLAME-USDC QS LP token
    address public stakingToken;

    /// @notice Token to be distributed as rewards : FLAME token
    address public rewardsToken;

    /// @notice Reward APY
    uint256 public rewardAPY;

    /// @notice Start time of staking
    uint256 public startTime;

    /// @notice Duration for unstake/claim penalty
    uint256 public earlyWithdrawal;

    /// @notice Full staking period
    uint256 public stakingPeriod;

    /// @notice Staking status for each user
    mapping(address => StakeInfo) public stakeInfos;

    /// @notice Total staking balance of this contract
    uint256 public totalStaked;

    /// @notice Emitted when users stake
    event Stake(address indexed _staker, uint256 amount);

    /// @notice Emitted when users unstake
    event Unstake(address indexed _staker, uint256 amount);

    /// @notice Emitted when users claim rewards
    event Claim(address indexed _staker, uint256 amount);

    /// @notice Emitted when startTime is set
    event StartTimeSet(uint256 startTime);

    function initialize(
        address _stakingToken,
        address _rewardsToken,
        uint256 _startTime,
        uint256 _rewardAPY
    ) external initializer {
        __Context_init();
        __Ownable_init();
        __ReentrancyGuard_init();

        stakingToken = _stakingToken;
        rewardsToken = _rewardsToken;
        startTime = _startTime;
        rewardAPY = _rewardAPY;

        earlyWithdrawal = 30 days;
        stakingPeriod = 90 days;
    }

    /**
     * @notice update the apy
     * @param _newApy is the new apy for update
     */
    function updateAPY(uint256 _newApy) external onlyOwner {
        rewardAPY = _newApy;
    }

    /**
     * @notice update the earlyWithdrawal
     * @param _earlyWithdrawal is the new earlyWithdrawal for update
     */
    function updateEarlyWithdrawal(uint256 _earlyWithdrawal) external onlyOwner {
        earlyWithdrawal = _earlyWithdrawal;
    }

    /**
     * @notice update the stakingPeriod
     * @param _stakingPeriod is the new stakingPeriod for update
     */
    function updateStakingPeriod(uint256 _stakingPeriod) external onlyOwner {
        stakingPeriod = _stakingPeriod;
    }

    /**
     * @notice Set staking start time
     * @dev Use this function to update staking schedule or start another staking
     * @param newStartTime New start time
     */
    function setStartTime(uint256 newStartTime) external onlyOwner {
        require(
            !isPoolOpen(),
            "setStartTime: Staking is in progress"
        );
        require(
            newStartTime > block.timestamp,
            "setStartTime: Should be time in future"
        );

        startTime = newStartTime;

        emit StartTimeSet(newStartTime);
    }

    /**
     * @notice deposit reward
     * @param amount to deposit
     */
    function depositRewardToken(uint256 amount) external onlyOwner {
        IERC20(rewardsToken).safeTransferFrom(_msgSender(), address(this), amount);
    }

    /**
     * @notice withdraw reward
     * @param amount to withdraw
     */
    function withdrawRewardToken(uint256 amount) external onlyOwner {
        IERC20(rewardsToken).safeTransfer(_msgSender(), amount);
    }

    /**
     * @notice Deposit token into staking pool
     * @param amount amount to stake
     */
    function stake(uint256 amount) external {
        require(isPoolOpen(), "Stake: Pool is not open");
        require(amount > 0, "Stake: Cannot stake 0");

        IERC20(stakingToken).safeTransferFrom(_msgSender(), address(this), amount);

        // we collect rewards whenever the stake balance is updated
        _accumulateStakesOf(_msgSender());

        StakeInfo storage stakeInfo = stakeInfos[_msgSender()];
        stakeInfo.total = stakeInfo.total.add(amount);
        stakeInfo.lastStakedAt = block.timestamp;
        totalStaked = totalStaked.add(amount);

        emit Stake(_msgSender(), amount);
    }

    /**
     * @notice Unstake LP token
     * @param amount amount to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Unstake: Cannot unstake 0");

        StakeInfo storage stakeInfo = stakeInfos[_msgSender()];

        require(stakeInfo.total >= amount, "Unstake: amount exceeds balance");

        // claim rewards first
        _claimRewardsOf(_msgSender());

        IERC20(stakingToken).safeTransfer(_msgSender(), amount);

        totalStaked = totalStaked.sub(amount);
        stakeInfo.total = stakeInfo.total.sub(amount);

        emit Unstake(_msgSender(), amount);
    }

    /**
     * @notice claim rewards of msg sender
     */
    function claimRewards() external nonReentrant {
        _claimRewardsOf(_msgSender());
    }

    /**
     * @notice calculate the rewards of the user
     * @return stored rewards + new rewards
     */
    function rewardsOf(address account) public view returns (uint256) {
        StakeInfo memory stakeInfo = stakeInfos[account];
        uint256 newStakes = _newAccumulatedStakesOf(account);
        return stakeInfo.accumulatedStakes.add(newStakes).mul(rewardAPY).div(100);
    }

    /**
     * @notice check if the staking is started
     * @return isStarted
     */
    function isStakingStarted() public view returns (bool isStarted) {
        isStarted = startTime <= block.timestamp;
    }

    /**
     * @notice check if the staking is ended
     * @return isEnded
     */
    function isStakingEnded() public view returns (bool isEnded) {
        isEnded = block.timestamp > (startTime + stakingPeriod);
    }

    /**
     * @notice check if pool is open
     * @return isOpen
     */
    function isPoolOpen() public view returns (bool isOpen) {
        isOpen = isStakingStarted() && !isStakingEnded();
    }

    /**
     * @notice claim rewards of a user
     */
    function _claimRewardsOf(address account) internal {
        _accumulateStakesOf(account);

        StakeInfo storage stakeInfo = stakeInfos[account];

        uint256 rewardAmount = stakeInfo.accumulatedStakes.mul(rewardAPY).div(100);
        if (block.timestamp <= stakeInfo.lastStakedAt.add(30 days))
            rewardAmount = rewardAmount.div(2);

        stakeInfo.accumulatedStakes = 0;

        IERC20(rewardsToken).safeTransfer(account, rewardAmount);

        emit Claim(account, rewardAmount);
    }

    /**
     * @notice calculate new rewards after the last collected time
     * @return newStake : stake amount that can be used for reward calculation
     */
    function _newAccumulatedStakesOf(address account) internal view returns (uint256 newStake) {
        StakeInfo memory stakeInfo = stakeInfos[account];

        if (stakeInfo.lastAccumulatedTime == 0) {
            return 0;
        }

        uint256 lastTime = block.timestamp;
        if (isStakingEnded())
            lastTime = startTime + stakingPeriod;

        uint256 duration = lastTime.sub(stakeInfo.lastAccumulatedTime);
        newStake = stakeInfo.total.mul(duration).div(365 days);
    }

    /**
     * @notice collect rewards of the account
     * @dev it updates the reward stored, but must remember this time as lastAccumulatedTime
     */
    function _accumulateStakesOf(address account) internal {
        StakeInfo storage stakeInfo = stakeInfos[account];

        stakeInfo.accumulatedStakes = stakeInfo.accumulatedStakes.add(_newAccumulatedStakesOf(account));
        stakeInfo.lastAccumulatedTime = block.timestamp;
    }
}
