//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract FlameStaking is Context, Ownable {
    using SafeMath for uint256;

    IERC20 lpToken;
    ERC20Burnable flameToken;

    uint256 rewardAPY = 40;
    uint256 poolStartTime;
    uint256 earlyWithdrawal = 30 days;
    uint256 fullMaturity = 90 days;

    struct STAKE_DETAIL {
        uint256 initTime;
        uint256 lastClaimedAt;
        uint256 rewardSoFar;
        uint256 firstStakedAt;
        uint256 total;
    }

    mapping(address => STAKE_DETAIL) stakingBalance;

    uint256 totalStakes;

    event Stake(address indexed _staker, uint256 amount);
    event Unstake(address indexed _staker, uint256 amount);
    event Withdraw(address indexed _staker, uint256 amount);

    constructor(
        IERC20 _lpToken,
        ERC20Burnable _flameToken,
        uint256 _poolStartTime,
        uint256 _rewardAPY
    ) {
        lpToken = _lpToken;
        flameToken = _flameToken;
        poolStartTime = _poolStartTime;
        rewardAPY = _rewardAPY;
    }

    /**
     * @notice get the earlyWithdrawal
     * @return earlyWithdrawal
     */
    function getEarlyWithdrawal() external view returns (uint256) {
        return earlyWithdrawal;
    }

    /**
     * @notice get the fullMaturity
     * @return fullMaturity
     */
    function getFullMaturity() external view returns (uint256) {
        return fullMaturity;
    }

    /**
     * @notice get the rewardAPY
     * @return rewardAPY
     */
    function getRewardAPY() external view returns (uint256) {
        return rewardAPY;
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
     * @notice update the fullMaturity
     * @param _fullMaturity is the new fullMaturity for update
     */
    function updateFullMaturity(uint256 _fullMaturity) external onlyOwner {
        fullMaturity = _fullMaturity;
    }

    /**
     * @notice check if the staking is started
     * @return isStarted
     */
    function isStakingStarted() public view returns (bool isStarted) {
        isStarted = poolStartTime <= block.timestamp;
    }

    /**
     * @notice check if pool is open
     * @return isOpen
     */
    function isPoolOpen() public view returns (bool isOpen) {
        isOpen = isStakingStarted() && poolStartTime + fullMaturity >= block.timestamp;
    }

    /**
     * @notice calculate total stakes of staker
     * @param _staker is the address of staker
     * @return _total
     */
    function totalStakeOf(address _staker) external view returns (uint256) {
        return stakingBalance[_staker].total;
    }

    /**
     * @notice calculate entire stake amount
     * @return _total
     */
    function getTotalStakes() external view returns (uint256) {
        return totalStakes;
    }

    /**
     * @notice get the poolStartTime
     * @return poolStartTime
     */
    function getPoolStartTime() external view returns (uint256) {
        return poolStartTime;
    }

    /**
     * @notice get the first staked time
     * @return firstStakedAt
     */
    function getFirstStakedAtOf(address _staker) external view returns (uint256) {
        return stakingBalance[_staker].firstStakedAt;
    }

    /**
     * @notice get total claimed reward of staker
     * @return rewardSoFar
     */
    function getRewardSoFarOf(address _staker) external view returns (uint256) {
        return stakingBalance[_staker].rewardSoFar;
    }

    /**
     * @notice calculate reward of staker
     * @return reward is the reward amount of the staker
     */
    function rewardOf(address _staker) public view returns (uint256) {
        STAKE_DETAIL memory _stakeDetail = stakingBalance[_staker];

        if (_stakeDetail.total == 0) return 0;

        uint256 rewardPeriod = block.timestamp.sub(_stakeDetail.lastClaimedAt);

        uint256 _totalReward = _stakeDetail.total.mul(rewardAPY).div(100).mul(rewardPeriod).div(365 days);

        return _totalReward;
    }

    function distributeReward(
        address _beneficiary,
        uint256 _amount,
        bool _burn
    ) private {
        if (_burn) {
            require(
                flameToken.transfer(_beneficiary, _amount.div(2)),
                "FlameStaking.distributeReward: FlameToken.Transfer: Failed to Distribute!"
            );
            flameToken.burn(_amount.div(2));
        } else
            require(
                flameToken.transfer(_beneficiary, _amount),
                "FlameStaking.distributeReward: FlameToken.Transfer: Failed to Distribute!"
            );
    }

    function claimReward() external {
        uint256 reward = rewardOf(_msgSender());
        STAKE_DETAIL storage _stake = stakingBalance[_msgSender()];

        bool burn = block.timestamp.sub(_stake.initTime) < 30 days;
        distributeReward(_msgSender(), reward, burn);
        _stake.lastClaimedAt = block.timestamp;
        if (burn) {
            _stake.rewardSoFar = _stake.rewardSoFar.add(reward.div(2));
        } else {
            _stake.rewardSoFar = _stake.rewardSoFar.add(reward);
        }

        emit Withdraw(_msgSender(), reward);
    }

    /**
     * @notice stake FLAME
     * @param _amount is the FLAME amount to stake
     */
    function stake(uint256 _amount) external {
        require(isPoolOpen(), "Pool is not open");

        require(
            lpToken.transferFrom(_msgSender(), address(this), _amount),
            "Stake: lpToken.TransferFrom: Failed to Stake!"
        );

        STAKE_DETAIL storage _stake = stakingBalance[_msgSender()];

        _stake.total = _stake.total.add(_amount);
        _stake.initTime = block.timestamp;
        _stake.lastClaimedAt = block.timestamp;
        totalStakes = totalStakes.add(_amount);

        emit Stake(_msgSender(), _amount);
    }

    /**
     * @notice unstake current staking
     */
    function unstake() external {
        require(stakingBalance[_msgSender()].total > 0, "Not staking");

        STAKE_DETAIL storage _stake = stakingBalance[_msgSender()];
        uint256 reward = rewardOf(_msgSender());
        uint256 total = _stake.total;

        distributeReward(_msgSender(), reward, block.timestamp.sub(_stake.initTime) < 30 days);
        require(lpToken.transfer(_msgSender(), total), "Unstake: lpToken.Transfer: Failed to Unstake!");

        totalStakes = totalStakes.sub(total);
        _stake.total = 0;
        _stake.rewardSoFar = _stake.rewardSoFar.add(reward);
        _stake.firstStakedAt = 0;

        emit Unstake(_msgSender(), total);
    }

    /**
     * @notice deposite reward
     * @param _amount to deposite
     */
    function depositeReward(uint256 _amount) external onlyOwner {
        require(
            flameToken.transferFrom(_msgSender(), address(this), _amount),
            "Deposite: FlameToken.TransferFrom: Failed to Deposite!"
        );
    }

    /**
     * @notice withdraw reward
     * @param _amount to withdraw
     */
    function withdrawReward(uint256 _amount) external onlyOwner {
        require(flameToken.transfer(_msgSender(), _amount), "Withdraw: FlameToken.TransferFrom: Failed to Withdraw!");
    }
}
