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

    enum PenaltyMode {
        STATIC,
        LINEAR
    }

    uint256 constant APY_BASE = 1e18;

    uint256 constant POWER_BASE = 100;

    uint256 constant PENALTY_BASE = 100;

    uint256 constant ONE_YEAR = 365 days;


    struct TierInfo {
        uint256 apy;
        uint256 power;
        uint256 penalty;
        uint256 lockPeriod;
        uint256 fullPenaltyCliff;
        PenaltyMode penaltyMode;
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

    event UnStakeEarly(
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
            apy: 0, // 4%
            power: POWER_BASE, // 1x
            penalty: 50 * PENALTY_BASE / 100, // 50%,
            lockPeriod: 30 days, // 30 days
            fullPenaltyCliff: 0,
            penaltyMode: PenaltyMode.STATIC
        }));

        tiers.push(TierInfo({
            apy: 9 * APY_BASE / 100, // 9%
            power: 110 * POWER_BASE / 100, // 1.1x
            penalty: 40 * PENALTY_BASE / 100, // 40%,
            lockPeriod: 180 days, // 180 days,
            fullPenaltyCliff: 0,
            penaltyMode: PenaltyMode.STATIC
        }));

        tiers.push(TierInfo({
            apy: 15 * APY_BASE / 100, // 15%
            power: 120 * POWER_BASE / 100, // 1.2x
            penalty: 35 * PENALTY_BASE / 100, // 35%,
            lockPeriod: ONE_YEAR, // 1 years
            fullPenaltyCliff: 30 days,
            penaltyMode: PenaltyMode.LINEAR
        }));

        tiers.push(TierInfo({
            apy: 25 * APY_BASE / 100, // 25%
            power: 2 * POWER_BASE, // 2x
            penalty: 30 * PENALTY_BASE / 100, // 30%,
            lockPeriod: 3 * ONE_YEAR, // 3 years
            fullPenaltyCliff: 90 days,
            penaltyMode: PenaltyMode.LINEAR
        }));
    }

    function addTierInfo(TierInfo calldata _tier) external onlyOwner {
        tiers.push(_tier);
    }

    function setTierInfo(uint256 _tierIndex, TierInfo calldata _tier) validTierIndex(_tierIndex) external onlyOwner {
        tiers[_tierIndex] = _tier;
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


    function unstakeEarly(uint256 _stakeId) external validStakeId(_stakeId) {
        StakeInfo storage stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        require(stakeInfo.account == msg.sender, "Invalid account");
        require(stakeInfo.unstakedAt == 0, "Invalid unstakedAt");

        uint256 duration = block.timestamp - stakeInfo.stakedAt;
        require(duration > tier.lockPeriod, "Invalid lock period");

        uint256 penaltyAmount;
        if(tier.penaltyMode == PenaltyMode.STATIC) {
            penaltyAmount = stakeInfo.amount * tier.penalty / PENALTY_BASE;
        } else {
            if(duration <= tier.fullPenaltyCliff) {
                penaltyAmount = stakeInfo.amount;
            } else {
                penaltyAmount = stakeInfo.amount * duration / tier.lockPeriod;
            }
        }
        //  stakeInfo.amount * tier.penalty / PENALTY_BASE;
        stakeInfo.unstakedAt = block.timestamp;

        token.safeTransfer(msg.sender, stakeInfo.amount - penaltyAmount);

        emit UnStakeEarly(msg.sender, _stakeId, stakeInfo.amount, penaltyAmount, block.timestamp);
    }

    function getPaneltyAmount(uint256 _stakeId) validStakeId(_stakeId) public view returns(uint256) {
        StakeInfo memory stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        uint256 duration = block.timestamp - stakeInfo.stakedAt;
        require(duration > tier.lockPeriod, "Invalid lock period");

        uint256 penaltyAmount;
        if(tier.penaltyMode == PenaltyMode.STATIC) {
            penaltyAmount = stakeInfo.amount * tier.penalty / PENALTY_BASE;
        } else {
            if(duration <= tier.fullPenaltyCliff) {
                penaltyAmount = stakeInfo.amount;
            } else {
                penaltyAmount = stakeInfo.amount * duration / tier.lockPeriod;
            }
        }

        return penaltyAmount;
    }

    function getPowerOfStake(uint256 _stakeId) validStakeId(_stakeId) public view returns(uint256) {
        uint256 tierIndex = userStakeOf[_stakeId].tierIndex;

        return tiers[tierIndex].power * userStakeOf[_stakeId].amount / POWER_BASE;
    }

    function getPowerOfAccount(address _account) public view returns(uint256) {
        uint256 power;

        for (uint256 i = 0; i < stakeIdsOf[_account].length(); i++) {
            uint256 stakeId = stakeIdsOf[_account].at(i);
            StakeInfo memory userStake = userStakeOf[stakeId];

            if (userStake.unstakedAt == 0) {
                power += getPowerOfStake(stakeId);
            }
        }

        return power;
    }

    function getUserStakesCount(address _account) external view returns (uint256) {
        return stakeIdsOf[_account].length();
    }

    function getUserStakeId(address _account, uint256 idx) external view returns (uint256) {
        return stakeIdsOf[_account].at(idx);
    }

    function getUserStakeIds(address _account) external view returns (uint256[] memory) {
        uint256[] memory stakeIds;

        for(uint256 i = 0; i < stakeIdsOf[_account].length(); i++) {
            stakeIds[i] = stakeIdsOf[_account].at(i);
        }

        return stakeIds;
    }
}
