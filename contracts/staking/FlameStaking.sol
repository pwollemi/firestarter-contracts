//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./FlameAccessControl.sol";
import "./RewardDistributor.sol";

contract FlameStaking is Context {
    using SafeMath for uint256;

    IERC20 flameToken;
    FlameAccessControl accessControl;
    RewardDistributor distributor;

    mapping(address => bool) whitelist;

    uint256 rewardAPY = 40;
    uint256 poolStartTime;
    uint256 poolPeriod = 5 days;
    uint256 earlyWithdrawal = 30 days;
    uint256 fullMaturity = 60 days;
    uint256 mandatoryLock = 5 days;
    uint256 poolSize = 2000000 * 10**18;
    bool _isPrivate = true;

    uint256 minContribution = 3000 * 10**18;
    uint256 maxContribution = 20000 * 10**18;

    struct STAKE {
        uint256 initTime;
        uint256 lastClaimedAt;
        uint256 amount;
    }

    struct STAKE_DETAIL {
        STAKE[] stakes;
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
        FlameAccessControl _accessControl,
        RewardDistributor _distributor,
        IERC20 _flameToken,
        uint256 _poolStartTime,
        uint256 _rewardAPY,
        uint256 _minContribution,
        uint256 _maxContribution,
        uint256 _mandatoryLock,
        bool _private
    ) {
        accessControl = _accessControl;
        distributor = _distributor;
        flameToken = _flameToken;
        poolStartTime = _poolStartTime;
        rewardAPY = _rewardAPY;
        minContribution = _minContribution;
        maxContribution = _maxContribution;
        mandatoryLock = _mandatoryLock;
        _isPrivate = _private;
    }

    modifier onlyManager {
        require(
            accessControl.hasManagerRole(_msgSender()),
            "Need manager role"
        );
        _;
    }

    modifier onlyWhitelisted {
        require(
            whitelist[_msgSender()] || !_isPrivate,
            "Need to be whitelisted"
        );
        _;
    }

    /**
     * @notice change access control contract
     * @param _accessControl is new access control contract
     */
    function updateAccessControl(FlameAccessControl _accessControl) external {
        require(
            accessControl.hasAdminRole(_msgSender()),
            "updateAccessControl: Sender must be admin"
        );

        require(
            address(_accessControl) != address(0),
            "updateAccessControl: New access controls cannot be ZERO address"
        );

        accessControl = _accessControl;
    }

    /**
     * @notice change distributor contract
     * @param _distributor is new distributor contract
     */
    function updateDistributor(RewardDistributor _distributor) external {
        require(
            accessControl.hasAdminRole(_msgSender()),
            "updateDistributor: Sender must be admin"
        );

        require(
            address(_distributor) != address(0),
            "updateDistributor: New Distributor cannot be ZERO address"
        );

        distributor = _distributor;
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
     * @notice get the poolPeriod
     * @return poolPeriod
     */
    function getPoolPeriod() external view returns (uint256) {
        return poolPeriod;
    }

    /**
     * @notice get the poolSize
     * @return poolSize
     */
    function getPoolSize() external view returns (uint256) {
        return poolSize;
    }

    /**
     * @notice get the rewardAPY
     * @return rewardAPY
     */
    function getRewardAPY() external view returns (uint256) {
        return rewardAPY;
    }

    /**
     * @notice get the minContribution
     * @return minContribution
     */
    function getMinContribution() external view returns (uint256) {
        return minContribution;
    }

    /**
     * @notice get the maxContribution
     * @return maxContribution
     */
    function getMaxContribution() external view returns (uint256) {
        return maxContribution;
    }

    /**
     * @notice get the mandatoryLock
     * @return mandatoryLock
     */
    function getMandatoryLock() external view returns (uint256) {
        return mandatoryLock;
    }

    /**
     * @notice get _isPrivate
     * @return _isPrivate
     */
    function isPrivate() external view returns (bool) {
        return _isPrivate;
    }

    /**
     * @notice set pool private
     */
    function setPrivate(bool _private) external onlyManager {
        _isPrivate = _private;
    }

    /**
     * @notice set the minContribution
     */
    function setMinContribution(uint256 _minContribution) external onlyManager {
        minContribution = _minContribution;
    }

    /**
     * @notice set the maxContribution
     */
    function setMaxContribution(uint256 _maxContribution) external onlyManager {
        maxContribution = _maxContribution;
    }

    /**
     * @notice set the mandatoryLock
     */
    function setMandatoryLock(uint256 _mandatoryLock) external onlyManager {
        mandatoryLock = _mandatoryLock;
    }

    /**
     * @notice update the apy
     * @param _newApy is the new apy for update
     */
    function updateAPY(uint256 _newApy) external onlyManager {
        rewardAPY = _newApy;
    }

    /**
     * @notice update the contribution period
     * @param _poolPeriod is the new period for update
     */
    function updatePoolPeriod(uint256 _poolPeriod) external onlyManager {
        poolPeriod = _poolPeriod;
    }

    /**
     * @notice update the earlyWithdrawal
     * @param _earlyWithdrawal is the new earlyWithdrawal for update
     */
    function updateEarlyWithdrawal(uint256 _earlyWithdrawal)
        external
        onlyManager
    {
        earlyWithdrawal = _earlyWithdrawal;
    }

    /**
     * @notice update the fullMaturity
     * @param _fullMaturity is the new fullMaturity for update
     */
    function updateFullMaturity(uint256 _fullMaturity) external onlyManager {
        fullMaturity = _fullMaturity;
    }

    /**
     * @notice add address to the whitelist
     * @param _addr is address to add
     */
    function addToWhitelist(address _addr) external onlyManager {
        whitelist[_addr] = true;
    }

    /**
     * @notice removes address from the whitelist
     * @param _addr is address to remove
     */
    function removeFromWhitelist(address _addr) external onlyManager {
        whitelist[_addr] = false;
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
        isOpen =
            isStakingStarted() &&
            poolStartTime + poolPeriod >= block.timestamp &&
            totalStakes < poolSize;
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
    function getFirstStakedAtOf(address _staker)
        external
        view
        returns (uint256)
    {
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

        uint256 _totalReward;

        for (uint256 i = 0; i < _stakeDetail.stakes.length; i = i.add(1)) {
            STAKE memory _stake = _stakeDetail.stakes[i];
            uint256 maturityAt = _stake.initTime + fullMaturity;

            if (_stake.initTime + earlyWithdrawal > block.timestamp) continue;
            if (
                maturityAt <= block.timestamp &&
                _stake.lastClaimedAt >= maturityAt
            ) continue;

            uint256 timePassed;
            uint256 timeNow = block.timestamp;

            if (timeNow > maturityAt) timeNow = maturityAt;

            timePassed = timeNow - earlyWithdrawal - _stake.initTime;

            if (
                _stake.lastClaimedAt != _stake.initTime &&
                _stake.lastClaimedAt >= _stake.initTime + earlyWithdrawal
            ) {
                timePassed = timePassed.sub(
                    _stake.lastClaimedAt - earlyWithdrawal - _stake.initTime
                );
            }

            uint256 _reward = _stake
            .amount
            .mul(rewardAPY)
            .div(100)
            .mul(timePassed)
            .div(365 days);

            _totalReward = _totalReward.add(_reward);
        }

        return _totalReward;
    }

    function claimReward() external onlyWhitelisted {
        require(
            stakingBalance[_msgSender()].firstStakedAt + mandatoryLock <=
                block.timestamp,
            "Locked for mandatory period"
        );

        uint256 reward = rewardOf(_msgSender());
        STAKE_DETAIL storage _stake = stakingBalance[_msgSender()];

        distributor.distribute(_msgSender(), reward);
        for (uint256 i = 0; i < _stake.stakes.length; i = i.add(1)) {
            _stake.stakes[i].lastClaimedAt = block.timestamp;
        }

        _stake.rewardSoFar = _stake.rewardSoFar.add(reward);

        emit Withdraw(_msgSender(), reward);
    }

    /**
     * @notice stake FLAME
     * @param _amount is the FLAME amount to stake
     */
    function stake(uint256 _amount) external onlyWhitelisted {
        require(isPoolOpen(), "Pool is not open");
        require(totalStakes.add(_amount) <= poolSize, "Not enough space");
        require(
            stakingBalance[_msgSender()].total.add(_amount) <= maxContribution,
            "Shouldn't exceed max contribution"
        );
        require(
            stakingBalance[_msgSender()].total.add(_amount) >= minContribution,
            "Should be at least min contribution"
        );

        require(
            flameToken.transferFrom(_msgSender(), address(this), _amount),
            "Stake: flameToken.TransferFrom: Failed to Stake!"
        );

        STAKE_DETAIL storage _stake = stakingBalance[_msgSender()];

        if (_stake.total == 0) {
            _stake.firstStakedAt = block.timestamp;
        }

        _stake.total = _stake.total.add(_amount);
        _stake.stakes.push(STAKE(block.timestamp, block.timestamp, _amount));
        totalStakes = totalStakes.add(_amount);

        emit Stake(_msgSender(), _amount);
    }

    /**
     * @notice unstake current staking
     */
    function unstake() external onlyWhitelisted {
        require(stakingBalance[_msgSender()].total > 0, "Not staking");
        require(
            stakingBalance[_msgSender()].firstStakedAt + mandatoryLock <=
                block.timestamp,
            "Locked for mandatory period"
        );

        STAKE_DETAIL storage _stake = stakingBalance[_msgSender()];
        uint256 reward = rewardOf(_msgSender());
        uint256 total = _stake.total;

        distributor.distribute(_msgSender(), reward);
        require(
            flameToken.transfer(_msgSender(), total),
            "Unstake: flameToken.Transfer: Failed to Unstake!"
        );

        totalStakes = totalStakes.sub(total);
        _stake.total = 0;
        _stake.rewardSoFar = _stake.rewardSoFar.add(reward);
        _stake.firstStakedAt = 0;
        delete _stake.stakes;

        emit Unstake(_msgSender(), total);
    }
}
