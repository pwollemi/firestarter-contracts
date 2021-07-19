//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Firestarter Staking Contract
/// @author Ryan Jun, Daniel Lee
/// @notice Firestarter Staking Contract
/// @dev All function calls are currently implemented without side effects
contract StakingPool is Context, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct StakeInfo {
        // Last stake time
        uint256 lastStakedAt;
        // Total staked amount
        uint256 total;
        // Last reward update time
        uint256 lastUpdateTime;
        // Stored rewards before lastUpdateTime
        uint256 rewardStored;
    }

    /// @notice Token to stake in the pool : FLAME-USDC QS LP token
    address public stakingToken;

    /// @notice Token to be distributed as rewards : FLAME token
    address public rewardsToken;

    /// @notice Reward APY
    uint256 public rewardAPY = 40;

    /// @notice Start time of staking
    uint256 public startTime;

    /// @notice Duration for unstake/claim penalty
    uint256 public earlyWithdrawal = 30 days;

    /// @notice Full staking period
    uint256 public stakingPeriod = 90 days;

    /// @notice Staking status for each user
    mapping(address => StakeInfo) public stakeInfos;

    // Total staking balance of this contract
    uint256 public totalStaked;

    // Emitted when users stake
    event Stake(address indexed _staker, uint256 amount);

    // Emitted when users unstake
    event Unstake(address indexed _staker, uint256 amount);

    // Emitted when users claim rewards
    event Claim(address indexed _staker, uint256 amount);

    constructor(
        address _stakingToken,
        address _rewardsToken,
        uint256 _startTime,
        uint256 _rewardAPY
    ) {
        stakingToken = _stakingToken;
        rewardsToken = _rewardsToken;
        startTime = _startTime;
        rewardAPY = _rewardAPY;
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
        _collectRewardsOf(_msgSender());

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
     * @return rewardStored + new rewards
     */
    function rewardOf(address account) public view returns (uint256) {
        StakeInfo memory stakeInfo = stakeInfos[account];
        uint256 newReward = _newRewardsOf(account);
        return stakeInfo.rewardStored.add(newReward);
    }

    /**
     * @notice check if the staking is started
     * @return isStarted
     */
    function isStakingStarted() public view returns (bool isStarted) {
        isStarted = startTime <= block.timestamp;
    }

    /**
     * @notice check if pool is open
     * @return isOpen
     */
    function isPoolOpen() public view returns (bool isOpen) {
        isOpen = isStakingStarted() && block.timestamp <= (startTime + stakingPeriod);
    }

    /**
     * @notice claim rewards of a user
     */
    function _claimRewardsOf(address account) internal {
        _collectRewardsOf(account);

        StakeInfo storage stakeInfo = stakeInfos[account];

        uint256 rewardAmount = stakeInfo.rewardStored;
        if (block.timestamp <= stakeInfo.lastStakedAt.add(30 days))
            rewardAmount = rewardAmount.div(2);

        stakeInfo.rewardStored = 0;

        IERC20(rewardsToken).safeTransfer(account, rewardAmount);

        emit Claim(account, rewardAmount);
    }

    /**
     * @notice calculate new rewards after the last collected time
     * @return newReward : reward amount
     */
    function _newRewardsOf(address account) internal view returns (uint256 newReward) {
        StakeInfo memory stakeInfo = stakeInfos[account];

        if (stakeInfo.lastUpdateTime == 0) {
            return 0;
        }

        uint256 duration = block.timestamp.sub(stakeInfo.lastUpdateTime);
        newReward = stakeInfo.total.mul(rewardAPY).div(100).mul(duration).div(365 days);
    }

    /**
     * @notice collect rewards of the account
     * @dev it updates the reward stored, but must remember this time as lastUpdateTime
     */
    function _collectRewardsOf(address account) internal {
        StakeInfo storage stakeInfo = stakeInfos[account];

        stakeInfo.rewardStored = stakeInfo.rewardStored.add(_newRewardsOf(account));
        stakeInfo.lastUpdateTime = block.timestamp;
    }
}
