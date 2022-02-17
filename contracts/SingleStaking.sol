// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract SingleStaking is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    uint256 constant APY_BASE = 1e18;

    uint256 constant POWER_BASE = 100;

    uint256 constant PENALTY_BASE = 100;

    uint256 constant ONE_YEAR = 365 days;


    struct TierInfo {
        uint256 apy;
        uint256 power;
        uint256 penalty;
        uint256 lockPeriod;
    }

    struct StakeInfo {
        address account;
        uint256 amount;
        uint256 stakedAt;
        uint256 unstakedAt;
        uint256 tierIndex;
    }

    uint256 public currentStakeId;

    TierInfo[] public tiers;

    IERC20Upgradeable public token;

    mapping(uint256 => StakeInfo) public userStakeOf;

    mapping(address => EnumerableSetUpgradeable.UintSet) private stakeIdsOf;

    // events
    event Stake(
        address indexed account,
        uint256 indexed stakeId,
        uint256 amount,
        uint256 stakedAt,
        uint256 tierIndex
    );

    event Unstake(
        address indexed account,
        uint256 indexed stakeId,
        uint256 amount,
        uint256 rewardAmount,
        uint256 unstakedAt
    );

    event EmergencyWithdraw(
        address indexed account,
        uint256 indexed stakeId,
        uint256 amount,
        uint256 penaltyAmount,
        uint256 unstakedAt
    );

    modifier validTierIndex(uint256 index) {
        require(index < tiers.length, "SingleStaking: invalid tier index");
        _;
    }

    modifier validStakeId(uint256 stakeId) {
        require(stakeId < currentStakeId, "SingleStaking: invalid stakeId");
        _;
    }

    function initialize(IERC20Upgradeable _token) external initializer {
        __Ownable_init();

        require(address(_token) != address(0), "SingleStaking: token address cannot be zero");
        token = _token;

        tiers.push(TierInfo({
            apy: 4 * APY_BASE / 100, // 4%
            power: POWER_BASE, // 1x
            penalty: 20 * PENALTY_BASE / 100, // 20%,
            lockPeriod: 60 days // 60 days
        }));

        tiers.push(TierInfo({
            apy: 6 * APY_BASE / 100, // 6%
            power: 130 * POWER_BASE / 100, // 1.3x
            penalty: 50 * PENALTY_BASE / 100, // 50%,
            lockPeriod: ONE_YEAR // 1 year
        }));

        tiers.push(TierInfo({
            apy: 8 * APY_BASE / 100, // 8%
            power: 142 * POWER_BASE / 100, // 1.42x
            penalty: 50 * PENALTY_BASE / 100, // 50%,
            lockPeriod: 2 * ONE_YEAR // 2 years
        }));

        tiers.push(TierInfo({
            apy: 10 * APY_BASE / 100, // 10%
            power: 2 * POWER_BASE, // 2x
            penalty: 65 * PENALTY_BASE / 100, // 65%,
            lockPeriod: 3 * ONE_YEAR // 3 years
        }));
    }

    function stake(uint256 _amount, uint256 _tierIndex) external validTierIndex(_tierIndex) {
        token.safeTransferFrom(msg.sender, address(this), _amount);

        StakeInfo storage stakeInfo = userStakeOf[currentStakeId];

        stakeInfo.account = msg.sender;
        stakeInfo.amount = _amount;
        stakeInfo.stakedAt = block.timestamp;
        stakeInfo.tierIndex = _tierIndex;

        stakeIdsOf[msg.sender].add(currentStakeId);

        emit Stake(msg.sender, currentStakeId, _amount, block.timestamp, _tierIndex);

        currentStakeId ++;
    }

    function unstake(uint256 _stakeId) external validStakeId(_stakeId) {
        StakeInfo storage stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        require(stakeInfo.account == msg.sender, "Invalid account");
        require(stakeInfo.unstakedAt == 0, "Invalid unstakedAt");
        require(stakeInfo.stakedAt + tier.lockPeriod <= block.timestamp, "Invalid lock period");
        
        uint256 rewardAmount = stakeInfo.amount * tier.apy / APY_BASE;
        stakeInfo.unstakedAt = block.timestamp;

        token.safeTransfer(msg.sender, rewardAmount + stakeInfo.amount);

        emit Unstake(msg.sender, _stakeId, stakeInfo.amount, rewardAmount, block.timestamp);
    }


    function emergencyWithdraw(uint256 _stakeId) external validStakeId(_stakeId) {
        StakeInfo storage stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        require(stakeInfo.account == msg.sender, "Invalid account");
        require(stakeInfo.unstakedAt == 0, "Invalid unstakedAt");
        require(stakeInfo.stakedAt + tier.lockPeriod > block.timestamp, "Invalid lock period");

        uint256 penaltyAmount = stakeInfo.amount * tier.penalty / PENALTY_BASE;
        stakeInfo.unstakedAt = block.timestamp;

        token.safeTransfer(msg.sender, stakeInfo.amount - penaltyAmount);

        emit EmergencyWithdraw(msg.sender, _stakeId, stakeInfo.amount, penaltyAmount, block.timestamp);
    }

    function getPaneltyAmount(uint256 _stakeId) validStakeId(_stakeId) public view returns(uint256) {
        StakeInfo memory stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        return stakeInfo.amount * tier.penalty / PENALTY_BASE;
    }

    function getStakingPower(uint256 _stakeId) validStakeId(_stakeId) public view returns(uint256) {
        uint256 tierIndex = userStakeOf[_stakeId].tierIndex;

        return tiers[tierIndex].power;
    }

}
