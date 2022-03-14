// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract SingleStaking is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    enum PenaltyMode {
        STATIC,
        LINEAR
    }

    uint256 constant DECIMAL_BASE = 100;

    uint256 constant ONE_YEAR = 365 days;


    struct TierInfo {
        uint256 apy;
        uint256 power;
        uint256 penalty;
        uint256 lockPeriod;
        uint256 fullPenaltyCliff;
        PenaltyMode penaltyMode;
        bool isActive;
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

    IERC721Upgradeable public hiro;

    address public hiroTreasury;

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

    event UnstakeWithHiro(
        address indexed account,
        uint256 indexed stakeId,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 rewardAmount,
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

    function initialize(IERC20Upgradeable _token, IERC721Upgradeable _hiro, address _hiroTreasury) external initializer {
        __Ownable_init();

        require(address(_token) != address(0), "SingleStaking: token address cannot be zero");
        token = _token;
        hiro = _hiro;
        hiroTreasury = _hiroTreasury;
    }

    function addTierInfo(TierInfo calldata _tier) external onlyOwner {
        tiers.push(_tier);
    }

    function setTierStatus(uint256 _tierIndex, bool _isActive) validTierIndex(_tierIndex) external onlyOwner {
        tiers[_tierIndex].isActive = _isActive;
    } 

    function setHiroTreasury(address _hiroTreasury) external onlyOwner {
        hiroTreasury = _hiroTreasury;
    }

    function stake(uint256 _amount, uint256 _tierIndex) external validTierIndex(_tierIndex) {
        require(tiers[_tierIndex].isActive, "Inactive tier");

        StakeInfo storage stakeInfo = userStakeOf[currentStakeId];

        stakeInfo.account = msg.sender;
        stakeInfo.amount = _amount;
        stakeInfo.stakedAt = block.timestamp;
        stakeInfo.tierIndex = _tierIndex;
        
        stakeIdsOf[msg.sender].add(currentStakeId);
        currentStakeId ++;

        token.safeTransferFrom(msg.sender, address(this), _amount);

        emit Stake(msg.sender, currentStakeId, _amount, block.timestamp, _tierIndex);
    }

    function unstake(uint256 _stakeId) external validStakeId(_stakeId) {
        StakeInfo storage stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        require(stakeInfo.account == msg.sender, "Invalid account");
        require(stakeInfo.unstakedAt == 0, "Invalid unstakedAt");
        require(stakeInfo.stakedAt + tier.lockPeriod <= block.timestamp, "Invalid lock period");
        
        uint256 rewardAmount = stakeInfo.amount * tier.apy * tier.lockPeriod / DECIMAL_BASE / ONE_YEAR;
        stakeInfo.unstakedAt = block.timestamp;

        token.safeTransfer(msg.sender, rewardAmount + stakeInfo.amount);

        emit Unstake(msg.sender, _stakeId, stakeInfo.amount, rewardAmount, block.timestamp);
    }

    function unstakeEarly(uint256 _stakeId) external validStakeId(_stakeId) {
        StakeInfo storage stakeInfo = userStakeOf[_stakeId];

        require(stakeInfo.account == msg.sender, "Invalid account");
        require(stakeInfo.unstakedAt == 0, "Invalid unstakedAt");

        uint256 penaltyAmount  = getPenaltyAmount(_stakeId);
        require(penaltyAmount > 0, "Invalid penaltyAmount");
        
        stakeInfo.unstakedAt = block.timestamp;

        token.safeTransfer(msg.sender, stakeInfo.amount - penaltyAmount);

        emit UnStakeEarly(msg.sender, _stakeId, stakeInfo.amount, penaltyAmount, block.timestamp);
    }

    function unstakeEarlyUsingHiro(uint256 _stakeId, uint256 _tokenId) external validStakeId(_stakeId) {
        StakeInfo storage stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        require(stakeInfo.account == msg.sender, "Invalid account");
        require(stakeInfo.unstakedAt == 0, "Invalid unstakedAt");

        uint256 duration = block.timestamp - stakeInfo.stakedAt;
        require(duration < tier.lockPeriod, "Invalid lock period");

        uint256 rewardAmount = stakeInfo.amount * tier.apy * duration / DECIMAL_BASE / ONE_YEAR;
        stakeInfo.unstakedAt = block.timestamp;

        token.safeTransfer(msg.sender, rewardAmount + stakeInfo.amount);
        hiro.safeTransferFrom(msg.sender, hiroTreasury, _tokenId);

        emit UnstakeWithHiro(msg.sender, _stakeId, _tokenId, stakeInfo.amount, rewardAmount, block.timestamp);
    }

    function getAccumulatedRewardAmount(uint256 _stakeId) validStakeId(_stakeId) public view returns (uint256) {
        StakeInfo memory stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        if(stakeInfo.unstakedAt > 0) {
            return 0;
        }

        uint256 duration = block.timestamp - stakeInfo.stakedAt;
        if(duration > tier.lockPeriod) {
            duration = tier.lockPeriod;
        }

        return stakeInfo.amount * tier.apy * duration / DECIMAL_BASE / ONE_YEAR;
    }

    function getPenaltyAmount(uint256 _stakeId) validStakeId(_stakeId) public view returns(uint256) {
        StakeInfo memory stakeInfo = userStakeOf[_stakeId];
        TierInfo memory tier = tiers[stakeInfo.tierIndex];

        uint256 duration = block.timestamp - stakeInfo.stakedAt;
        if(duration > tier.lockPeriod) {
            return 0;
        }

        uint256 penaltyAmount;
        if(tier.penaltyMode == PenaltyMode.STATIC) {
            penaltyAmount = stakeInfo.amount * tier.penalty / DECIMAL_BASE;
        } else if(duration < tier.fullPenaltyCliff) {
            penaltyAmount = stakeInfo.amount;
        } else {
            uint256 total = (tier.lockPeriod - tier.fullPenaltyCliff) / 30 days;
            uint256 current = (duration - tier.fullPenaltyCliff) / 30 days;
            uint256 penaltyPercent = tier.penalty - tier.penalty * current / total;
            penaltyAmount = stakeInfo.amount *  penaltyPercent  /  DECIMAL_BASE;
        }

        return penaltyAmount;
    }

    function getPowerOfStake(uint256 _stakeId) validStakeId(_stakeId) public view returns(uint256) {
        uint256 tierIndex = userStakeOf[_stakeId].tierIndex;
        uint256 rewardAmount = getAccumulatedRewardAmount(_stakeId);

        return tiers[tierIndex].power * (userStakeOf[_stakeId].amount + rewardAmount) / DECIMAL_BASE;
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
