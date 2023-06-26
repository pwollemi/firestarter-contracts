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

import "../interfaces/IERC721Extended.sol";

/**
 * @title Flame Bet
 * @author Daniel Lee
 */
contract Bet is
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
        bool isOpened;
        uint256 claimedAt;
        RewardType rewardType;
        uint256 multiplierAnswer;
        // NFT
        uint256 claimedNftId;
        // ERC20
        uint256 totalAmount;
        uint256 withrawnAmount;
    }

    /************************** Bet config *************************/

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

    /************************** Boxes info *************************/

    // Total count of boxes
    uint256 public boxCount;

    // Ignition status of each token.
    mapping(uint256 => BoxInfo) public boxes;

    // Current nft id
    uint256 public currentNftId;

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

    event BoxCreated(uint256 indexed requestId, address indexed user, uint256 boxId);
    event BoxOpened(uint256 indexed requestId, uint256 boxId, RewardType indexed rewardType);
    event ClaimBox(address indexed user, uint256 boxId);
    event ClaimNFT(address indexed user, uint256 boxId, uint256 nftId);
    event StartVesting(address indexed user, uint256 boxId, uint256 startDate, uint256 betAmount, uint256 rewardAmount);
    event Withdraw(address indexed user, uint256 boxId, uint256 amount);

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
        callbackGasLimit = 40000;
        requestConfirmations = 3;
    }

    /**
     * @dev Sets the Flame contract address
     */
    function setFlame(address _flame) public onlyOwner {
        flame = _flame;
    }

    /**
     * @dev Sets the active period
     */
    function setActivePeriod(uint256 _startTime, uint256 _endTime) public onlyOwner {
        startTime = _startTime;
        endTime = _endTime;
    }

    /**
     * @dev Sets the current nft id
     */
    function setCurrentNftId(uint256 _nftId) public onlyOwner {
        currentNftId = _nftId;
    }

    /**
     * @dev Sets the minimum flame amount
     */
    function setBetAmount(uint256 _minFlameAmount, uint256 _maxFlameAmount) public onlyOwner {
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
     * @dev Open Box
     *
     * We assume chainlink VRF always correctly works, thus even though callback is not called, the flare will be marked as already tried ignition
     *
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

        // request random value to try ignition
        uint256 requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            2
        );

        vrfRequests[requestId] = boxId;

        emit BoxCreated(requestId, msg.sender, boxId);
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

        box.isOpened = true;

        emit BoxOpened(requestId, boxId, box.rewardType);
    }

    /**
     * @dev Claim flame amount of the user
     */
    function claimBox(uint256 boxId) public {
        require(ownerOf(boxId) == msg.sender, "Not owner");
        BoxInfo storage box = boxes[boxId];
        require(box.isOpened, "not opened");
        require(box.claimedAt == 0, "already claimed");

        if (box.rewardType.winType == WinType.NFT) {
            // start from 1
            currentNftId++;
            IERC721Extended(nft).mint(msg.sender, currentNftId);
            emit ClaimNFT(msg.sender, boxId, currentNftId);
        } else {
            uint256 multiplier = box.rewardType.multiplierRangeStart +
                (box.multiplierAnswer % (box.rewardType.multiplierRangeEnd - box.rewardType.multiplierRangeStart)) +
                1;
            box.totalAmount = (box.amount * multiplier) / ACCURACY;
            if (!box.rewardType.isVesting) {
                require(box.totalAmount > 0, "amount zero");
                box.withrawnAmount = box.totalAmount;
                IERC20Upgradeable(flame).safeTransfer(msg.sender, box.totalAmount);
                emit Withdraw(msg.sender, boxId, box.totalAmount);
            } else {
                emit StartVesting(msg.sender, boxId, block.timestamp, box.amount, box.totalAmount);
            }
        }
        box.claimedAt = block.timestamp;
        emit ClaimBox(msg.sender, boxId);
    }

    /**
     * @dev Returns vested amount from vesting
     */
    function vested(uint256 boxId) public view returns (uint256) {
        BoxInfo memory box = boxes[boxId];
        if (box.claimedAt == 0 || box.rewardType.winType == WinType.NFT || !box.rewardType.isVesting) return 0;

        uint256 lockEndTime = box.claimedAt + lockPeriod;
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
        emit Withdraw(msg.sender, boxId, _withdrawable);
    }
}
