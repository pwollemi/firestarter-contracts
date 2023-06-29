// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";

import "../chainlink/VRFConsumerBaseV2Upgradeable.sol";
import "../chainlink/VRFCoordinatorV2Interface.sol";

import "../interfaces/IERC1155Extended.sol";

contract LootBox is
    Initializable,
    OwnableUpgradeable,
    VRFConsumerBaseV2Upgradeable,
    ERC721EnumerableUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    enum WinType {
        NFT,
        ERC20
    }

    struct RewardType {
        WinType winType;
        uint256 winWeight;
        uint256 multiplierRangeStart;
        uint256 multiplierRangeEnd;
        bool isVesting;
    }

    struct BoxInfo {
        uint256 amount;
        uint256 openedAt;
        RewardType rewardType;
        uint256 multiplierAnswer;
        // NFT
        uint256 claimedNftId;
        // ERC20
        uint256 totalAmount;
        uint256 withrawnAmount;
    }

    /************************** Buy config *************************/

    uint256 public constant ACCURACY = 10000;

    // Flame address
    address public flame;

    // NFT address
    address public nft;

    // Minimum flame amount
    uint256 public minFlameAmount;

    // Maximum flame amount
    uint256 public maxFlameAmount;

    // Active startTime
    uint256 public startTime;

    // Active endTime
    uint256 public endTime;

    /************************** Reward info *************************/

    // Total weights
    uint256 public totalWeight;

    // Reward types
    RewardType[] public rewardTypes;

    // Tier info
    // eg. [100, 500, 2000, 5000]
    // Possible tiers are 5 so is `tiers` length
    uint256[] public flameTicks;

    // Tick index to tier
    uint256[] public tiers;

    /************************** Boxes info *************************/

    // Total count of boxes
    uint256 public boxCount;

    // Ignition status of each token.
    mapping(uint256 => BoxInfo) public boxes;

    /************************** Vesting params *************************/

    // Lock period
    uint256 public lockPeriod;

    // Vest period
    uint256 public vestPeriod;

    // First unlock
    uint256 public initialUnlock;

    // Interval period
    uint256 public releaseInterval;

    // Release rate per interval
    uint256 public releaseRate;

    /************************** VRF info *************************/

    // Chainlink VRF requestId => box id
    mapping(uint256 => uint256) internal vrfRequests;

    // VRF coordniator
    VRFCoordinatorV2Interface COORDINATOR;

    // Your subscription ID.
    uint64 s_subscriptionId;

    // Chainlink VRF Key Hash which varies by network
    bytes32 s_keyHash;

    // Depends on the number of requested values that you want sent to the
    // fulfillRandomWords() function. Storing each word costs about 20,000 gas,
    // so 40,000 is a safe default for this example contract. Test and adjust
    // this limit based on the network that you select, the size of the request,
    // and the processing of the callback request in the fulfillRandomWords()
    // function.
    uint32 callbackGasLimit;

    // The default is 3, but you can set this higher.
    uint16 requestConfirmations;

    /************************** Events *************************/

    event BoxCreated(uint256 indexed requestId, address indexed user, uint256 boxId, uint256 buyAmount);
    event BoxOpened(uint256 indexed requestId, uint256 boxId, RewardType rewardType, uint256 buyAmount);
    event ClaimNFT(address indexed user, uint256 boxId, uint256 nftId);
    event StartVesting(address indexed user, uint256 boxId, uint256 startDate, uint256 rewardAmount);
    event Withdraw(address indexed user, uint256 boxId, uint256 amount);
    event WithdrawVesting(address indexed user, uint256 boxId, uint256 amount);

    /**
     * @dev Initializes the contract
     */
    function initialize(
        address _flame,
        address _nft,
        address _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash,
        uint256 _minFlameAmount,
        uint256 _maxFlameAmount
    ) external initializer {
        __Ownable_init();
        __VRFConsumerBase_init(_vrfCoordinator);
        __ERC721Enumerable_init();
        __Pausable_init();
        __ERC721_init("Box", "Flame Box");

        nft = _nft;
        flame = _flame;
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        minFlameAmount = _minFlameAmount;
        maxFlameAmount = _maxFlameAmount;
        callbackGasLimit = 2500000;
        requestConfirmations = 3;

        // default tiers
        flameTicks.push(2500 ether);
        flameTicks.push(12000 ether);
        flameTicks.push(15000 ether);
        tiers.push(1);
        tiers.push(2);
        tiers.push(3);
        tiers.push(4);
    }

    /**
     * @dev Sets the Flame contract address
     */
    function setFlame(address _flame) public onlyOwner {
        flame = _flame;
    }

    function setVRFInfo(
        uint64 _subscriptionId,
        bytes32 _keyHash,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations
    ) public onlyOwner {
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
    }

    /**
     * @dev Sets the active period
     */
    function setActivePeriod(uint256 _startTime, uint256 _endTime) public onlyOwner {
        startTime = _startTime;
        endTime = _endTime;
    }

    /**
     * @dev Sets the minimum flame amount
     */
    function setBuyAmount(uint256 _minFlameAmount, uint256 _maxFlameAmount) public onlyOwner {
        minFlameAmount = _minFlameAmount;
        maxFlameAmount = _maxFlameAmount;
    }

    /**
     * @dev Sets the rewardTypes
     */
    function setRewardTypes(RewardType[] memory _rewardTypes) public onlyOwner {
        delete rewardTypes;
        totalWeight = 0;
        for (uint256 i; i < _rewardTypes.length; i++) {
            rewardTypes.push(_rewardTypes[i]);
            totalWeight += _rewardTypes[i].winWeight;
        }
    }

    /**
     * @dev Sets the tier information
     */
    function setTierInfo(uint256[] memory _flameTicks, uint256[] memory _tiers) public onlyOwner {
        delete flameTicks;
        delete tiers;
        for (uint256 i; i < _flameTicks.length; i++) {
            flameTicks.push(_flameTicks[i]);
        }
        for (uint256 i; i < _tiers.length; i++) {
            tiers.push(_tiers[i]);
        }
    }

    /**
     * @dev Sets the vesting params
     */
    function setVestingParams(
        uint256 _lockPeriod,
        uint256 _vestPeriod,
        uint256 _initialUnlock,
        uint256 _releaseInterval,
        uint256 _releaseRate
    ) public onlyOwner {
        lockPeriod = _lockPeriod;
        vestPeriod = _vestPeriod;
        initialUnlock = _initialUnlock;
        releaseInterval = _releaseInterval;
        releaseRate = _releaseRate;
    }

    /**
     * @dev Returns the count of options
     */
    function rewardTypesLength() public view returns (uint256) {
        return rewardTypes.length;
    }

    /**
     * @notice Get token id of the tier
     */
    function getTier(uint256 flameAmount) public view returns (uint256) {
        uint256 index;
        for (; index < flameTicks.length; index++) {
            if (flameAmount < flameTicks[index]) {
                break;
            }
        }
        return tiers[index];
    }

    /**
     * @dev Open Box
     */
    function createBox(uint256 amount) public {
        require(startTime <= block.timestamp && block.timestamp < endTime, "Not active");
        require(amount >= minFlameAmount, "Less than minimum");
        require(amount <= maxFlameAmount, "More than Maximum");

        IERC20Upgradeable(flame).safeTransferFrom(msg.sender, address(this), amount);

        uint256 boxId = boxCount;
        _mint(msg.sender, boxId);
        boxCount++;
        BoxInfo storage newBox = boxes[boxId];
        newBox.amount = amount;

        uint256 requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            2
        );

        vrfRequests[requestId] = boxId;

        emit BoxCreated(requestId, msg.sender, boxId, amount);
    }

    /**
     * @dev Callback function used by VRF Coordinator
     */
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 boxId = vrfRequests[requestId];
        BoxInfo storage box = boxes[boxId];

        uint256 result = randomWords[0] % totalWeight;
        for (uint256 i; i < rewardTypes.length; i++) {
            if (result < rewardTypes[i].winWeight) {
                box.rewardType = rewardTypes[i];
                box.multiplierAnswer = randomWords[1];
                break;
            }
            result -= rewardTypes[i].winWeight;
        }
        box.openedAt = block.timestamp;

        address beneficiary = ownerOf(boxId);

        if (box.rewardType.winType == WinType.NFT) {
            uint256 nftId = getTier(box.amount);
            IERC1155ExtendedUpgradeable(nft).mint(beneficiary, nftId, 1);
            emit ClaimNFT(beneficiary, boxId, nftId);
        } else {
            uint256 multiplier = box.rewardType.multiplierRangeStart +
                (box.multiplierAnswer % (box.rewardType.multiplierRangeEnd - box.rewardType.multiplierRangeStart)) +
                1;
            box.totalAmount = (box.amount * multiplier) / ACCURACY;
            if (!box.rewardType.isVesting) {
                require(box.totalAmount > 0, "amount zero");
                box.withrawnAmount = box.totalAmount;
                IERC20Upgradeable(flame).safeTransfer(beneficiary, box.totalAmount);
                emit Withdraw(beneficiary, boxId, box.totalAmount);
            } else {
                emit StartVesting(beneficiary, boxId, block.timestamp, box.totalAmount);
            }
        }
        emit BoxOpened(requestId, boxId, box.rewardType, box.amount);
    }

    /**
     * @dev Returns vested amount from vesting
     */
    function vested(uint256 boxId) public view returns (uint256) {
        BoxInfo memory box = boxes[boxId];
        if (box.openedAt == 0 || box.rewardType.winType == WinType.NFT || !box.rewardType.isVesting) return 0;

        uint256 lockEndTime = box.openedAt + lockPeriod;
        uint256 vestingEndTime = lockEndTime + vestPeriod;

        if (box.totalAmount == 0 || block.timestamp <= lockEndTime) {
            return 0;
        }

        if (block.timestamp > vestingEndTime) {
            return box.totalAmount;
        }

        uint256 initialUnlockAmount = (box.totalAmount * initialUnlock) / ACCURACY;
        uint256 unlockAmountPerInterval = (box.totalAmount * releaseRate) / ACCURACY;
        uint256 vestedAmount = ((block.timestamp - lockEndTime) / releaseInterval) *
            unlockAmountPerInterval +
            initialUnlockAmount;

        vestedAmount = box.withrawnAmount > vestedAmount ? box.withrawnAmount : vestedAmount;
        return vestedAmount > box.totalAmount ? box.totalAmount : vestedAmount;
    }

    /**
     * @dev Returns withdrawable amount from vesting
     */
    function withdrawable(uint256 boxId) public view returns (uint256) {
        BoxInfo memory box = boxes[boxId];
        return vested(boxId) - box.withrawnAmount;
    }

    /**
     * @notice Withdraw tokens when vesting is ended
     */
    function withdraw(uint256 boxId) external {
        require(ownerOf(boxId) == msg.sender, "Not owner");
        BoxInfo storage box = boxes[boxId];
        if (box.totalAmount == 0) return;
        uint256 _vested = vested(boxId);
        uint256 _withdrawable = withdrawable(boxId);
        box.withrawnAmount = _vested;

        require(_withdrawable > 0, "Nothing to withdraw");
        IERC20Upgradeable(flame).safeTransfer(msg.sender, _withdrawable);
        emit WithdrawVesting(msg.sender, boxId, _withdrawable);
    }
}
