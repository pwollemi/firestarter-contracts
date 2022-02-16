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

    uint256 constant PENATLY_BASE = 100;

    uint256 constant ONE_YEAR = 365 days;


    struct TierInfo {
        uint256 apy;
        uint256 power;
        uint256 penatly;
        uint256 lockPeriod;
    }

    struct StakeInfo {
        address account;
        uint256 amount;
        uint256 stakedAt;
        uint256 tierIndex;
    }

    uint256 public currentStakeId;

    TierInfo[] public tiers;

    IERC20Upgradeable public token;

    mapping(uint256 => StakeInfo) public userStakeOf;

    mapping(address => EnumerableSetUpgradeable.UintSet) private stakeIdsOf;


    modifier validTierIndex(uint256 index) {
        require(index < tiers.length, "SingleStaking: invalid tier index");
        _;
    }

    function initialize(IERC20Upgradeable _token) external initializer {
        __Ownable_init();

        require(address(_token) != address(0), "SingleStaking: token address cannot be zero");
        token = _token;

        tiers.push(TierInfo({
            apy: 4 * APY_BASE / 100, // 4%
            power: POWER_BASE, // 1x
            penatly: 20 * PENATLY_BASE / 100, // 20%,
            lockPeriod: 60 days // 60 days
        }));

        tiers.push(TierInfo({
            apy: 6 * APY_BASE / 100, // 6%
            power: 130 * POWER_BASE / 100, // 1.3x
            penatly: 50 * PENATLY_BASE / 100, // 50%,
            lockPeriod: ONE_YEAR // 1 year
        }));

        tiers.push(TierInfo({
            apy: 8 * APY_BASE / 100, // 8%
            power: 142 * POWER_BASE / 100, // 1.42x
            penatly: 20 * PENATLY_BASE / 100, // 20%,
            lockPeriod: 2 * ONE_YEAR // 2 years
        }));

        tiers.push(TierInfo({
            apy: 10 * APY_BASE / 100, // 10%
            power: 2 * POWER_BASE, // 2x
            penatly: 65 * PENATLY_BASE / 100, // 65%,
            lockPeriod: 3 * ONE_YEAR // 3 years
        }));
    }

    function stake(uint256 _amount, uint256 _tierIndex) external validTierIndex(_tierIndex) {
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), _amount);

        StakeInfo storage stakeInfo = userStakeOf[currentStakeId];

        stakeInfo.account = msg.sender;
        stakeInfo.amount = _amount;
        stakeInfo.stakedAt = block.timestamp;
        stakeInfo.tierIndex = _tierIndex;

        stakeIdsOf[msg.sender].add(currentStakeId);

        currentStakeId ++;
    }

    function unstake(uint256 _stakeId) external {

    }


    function emergencyWithdraw(uint256 _stakeId) external {

    }

    function getPaneltyAmount(uint256 _stakeId) public view returns(uint256) {
        require(_stakeId < currentStakeId, "SingleStaking: Invalid stake id");

        StakeInfo memory stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        
    }

}
