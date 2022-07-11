// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

contract FirestarterExternalSFTVesting is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct VestingParams {
        // Name of this tokenomics
        string vestingName;
        // Total amount to be vested
        uint256 amountToBeVested;
        // Period before release vesting starts, also it unlocks initialUnlock reward tokens. (in time unit of block.timestamp)
        uint256 lockPeriod;
        // Percent of tokens initially unlocked
        uint256 initialUnlock;
        // Period to release all reward token, after lockPeriod + vestingPeriod it releases 100% of reward tokens. (in time unit of block.timestamp)
        uint256 vestingPeriod;
        // Amount of time in seconds between withdrawal periods.
        uint256 releaseInterval;
        // Release percent in each withdrawing interval
        uint256 releaseRate;
    }

    struct VestingInfo {
        // Total amount of tokens to be vested.
        uint256 totalAmount;
        // The amount that has been withdrawn.
        uint256 amountWithdrawn;
    }

    /// @notice General decimal values ACCURACY unless specified differently (e.g. fees, exchange rates)
    uint256 public constant ACCURACY = 1e10;

    /*************************** Vesting Params *************************/

    /// @notice Total balance of this vesting contract
    uint256 public amountToBeVested;

    /// @notice Name of this vesting
    string public vestingName;

    /// @notice Start time of vesting
    uint256 public startTime;

    /// @notice Intervals that the release happens. Every interval, releaseRate of tokens are released.
    uint256 public releaseInterval;

    /// @notice Release percent in each withdrawing interval
    uint256 public releaseRate;

    /// @notice Percent of tokens initially unlocked
    uint256 public initialUnlock;

    /// @notice Period before release vesting starts, also it unlocks initialUnlock reward tokens. (in time unit of block.timestamp)
    uint256 public lockPeriod;

    /// @notice Period to release all reward token, after lockPeriod + vestingPeriod it releases 100% of reward tokens. (in time unit of block.timestamp)
    uint256 public vestingPeriod;

    /// @notice Reward token of the project.
    address public rewardToken;

    /*************************** Status Info *************************/

    /// @notice Owner address(presale)
    address public owner;

    /// @notice External Collection
    IERC721Upgradeable public vestingCollection;

    /// @notice Sum of all user's vesting amount
    uint256 public totalVestingAmount;

    /// @notice Vesting schedule info for each user(presale)
    /// tokenId => vestingInfo
    mapping(uint256 => VestingInfo) public recipients;

    // Participants list
    uint256[] internal participants;
    mapping(uint256 => uint256) internal indexOf;
    mapping(uint256 => bool) internal inserted;

    /// @notice Worker's address allowed to modify whitelist
    address public worker;

    /// @notice An event emitted when the vesting schedule is updated.
    event VestingInfoUpdated(uint256 indexed tokenId, uint256 totalAmount);

    /// @notice An event emitted when withdraw happens
    event Withdraw(uint256 indexed tokenId, address indexed beneficiary, uint256 amountWithdrawn);

    /// @notice An event emitted when startTime is set
    event StartTimeSet(uint256 startTime);

    /// @notice An event emitted when owner is updated
    event OwnerUpdated(address indexed newOwner);

    modifier onlyOwner() {
        require(owner == msg.sender, "Requires Owner Role");
        _;
    }

    /**
     * @dev Throws if called by any account other than the owner or the worker.
     */
    modifier onlyOwnerOrWorker() {
        require(owner == msg.sender || worker == msg.sender, "Vesting: caller is not the owner nor the worker");
        _;
    }

    function initialize(
        address _rewardToken,
        address _vestingCollection,
        VestingParams memory _params
    ) external initializer {
        require(_rewardToken != address(0), "initialize: rewardToken cannot be zero");
        require(_params.releaseRate > 0, "initialize: release rate cannot be zero");
        require(_params.releaseInterval > 0, "initialize: release interval cannot be zero");

        owner = msg.sender;
        rewardToken = _rewardToken;
        vestingCollection = IERC721Upgradeable(_vestingCollection);

        vestingName = _params.vestingName;
        amountToBeVested = _params.amountToBeVested;
        initialUnlock = _params.initialUnlock;
        releaseInterval = _params.releaseInterval;
        releaseRate = _params.releaseRate;
        lockPeriod = _params.lockPeriod;
        vestingPeriod = _params.vestingPeriod;
    }

    /**
     * @notice Return the number of participants
     */
    function participantCount() external view returns (uint256) {
        return participants.length;
    }

    /**
     * @notice Return the list of participants
     */
    function getParticipants() external view returns (uint256[] memory) {
        return participants;
    }

    /**
     * @notice Init Presale contract
     * @dev Thic changes the owner to presale
     * @param presale Presale contract address
     */
    function init(address presale) external onlyOwner {
        require(presale != address(0), "init: owner cannot be zero");
        owner = presale;
        emit OwnerUpdated(presale);
        IERC20Upgradeable(rewardToken).safeApprove(presale, type(uint256).max);
    }

    /**
     * @notice Update user vesting information
     * @dev This is called by presale contract
     * @param tokenId Token Id
     * @param amount Amount of reward token
     */
    function updateRecipient(uint256 tokenId, uint256 amount) external onlyOwnerOrWorker {
        require(
            startTime == 0 || startTime >= block.timestamp,
            "updateRecipient: Cannot update the receipient after started"
        );
        require(amount > 0, "updateRecipient: Cannot vest 0");

        // remove previous amount and add new amount
        totalVestingAmount = totalVestingAmount + amount - recipients[tokenId].totalAmount;

        uint256 depositedAmount = IERC20Upgradeable(rewardToken).balanceOf(address(this));
        require(depositedAmount >= totalVestingAmount, "updateRecipient: Vesting amount exceeds current balance");

        if (inserted[tokenId] == false) {
            inserted[tokenId] = true;
            indexOf[tokenId] = participants.length;
            participants.push(tokenId);
        }

        recipients[tokenId].totalAmount = amount;

        emit VestingInfoUpdated(tokenId, amount);
    }

    /**
     * @notice Set vesting start time
     * @dev This should be called before vesting starts
     * @param newStartTime New start time
     */
    function setStartTime(uint256 newStartTime) external onlyOwner {
        // Only allow to change start time before the counting starts
        require(startTime == 0 || startTime >= block.timestamp, "setStartTime: Already started");
        require(newStartTime > block.timestamp, "setStartTime: Should be time in future");

        startTime = newStartTime;

        emit StartTimeSet(newStartTime);
    }

    /**
     * @notice Withdraw tokens when vesting is ended
     * @dev Anyone can claim their tokens
     * Warning: Take care of re-entrancy attack here.
     * Reward tokens are from not our own, which means
     * re-entrancy can happen when the transfer happens.
     * For now, we do checks-effects-interactions, but
     * for absolute safety, we may use reentracny guard.
     */
    function withdraw(uint256 tokenId) external {
        VestingInfo storage vestingInfo = recipients[tokenId];
        address beneficiary = vestingCollection.ownerOf(tokenId);

        if (vestingInfo.totalAmount == 0) return;

        uint256 _vested = vested(tokenId);
        uint256 _withdrawable = withdrawable(tokenId);
        vestingInfo.amountWithdrawn = _vested;

        require(_withdrawable > 0, "Nothing to withdraw");
        IERC20Upgradeable(rewardToken).safeTransfer(beneficiary, _withdrawable);
        emit Withdraw(tokenId, beneficiary, _withdrawable);
    }

    /**
     * @notice Returns the amount of vested reward tokens
     * @dev Calculates available amount depending on vesting params
     * @param tokenId Token Id
     * @return amount : Amount of vested tokens
     */
    function vested(uint256 tokenId) public view virtual returns (uint256 amount) {
        uint256 lockEndTime = startTime + lockPeriod;
        uint256 vestingEndTime = lockEndTime + vestingPeriod;
        VestingInfo memory vestingInfo = recipients[tokenId];

        if (startTime == 0 || vestingInfo.totalAmount == 0 || block.timestamp <= lockEndTime) {
            return 0;
        }

        if (block.timestamp > vestingEndTime) {
            return vestingInfo.totalAmount;
        }

        uint256 initialUnlockAmount = (vestingInfo.totalAmount * initialUnlock) / ACCURACY;
        uint256 unlockAmountPerInterval = (vestingInfo.totalAmount * releaseRate) / ACCURACY;
        uint256 vestedAmount = ((block.timestamp - lockEndTime) / releaseInterval) *
            unlockAmountPerInterval +
            initialUnlockAmount;

        uint256 withdrawnAmount = recipients[tokenId].amountWithdrawn;
        vestedAmount = withdrawnAmount > vestedAmount ? withdrawnAmount : vestedAmount;

        return vestedAmount > vestingInfo.totalAmount ? vestingInfo.totalAmount : vestedAmount;
    }

    /**
     * @notice Return locked amount
     * @return Locked reward token amount
     */
    function locked(uint256 tokenId) public view returns (uint256) {
        uint256 totalAmount = recipients[tokenId].totalAmount;
        uint256 vestedAmount = vested(tokenId);
        return totalAmount - vestedAmount;
    }

    /**
     * @notice Return remaining withdrawable amount
     * @return Remaining vested amount of reward token
     */
    function withdrawable(uint256 tokenId) public view returns (uint256) {
        uint256 vestedAmount = vested(tokenId);
        uint256 withdrawnAmount = recipients[tokenId].amountWithdrawn;
        return vestedAmount - withdrawnAmount;
    }

    /**
     * @notice Set worker
     * @param _worker worker's address
     */
    function setWorker(address _worker) external onlyOwner {
        worker = _worker;
    }

    /**
     * @notice Remove worker
     */
    function removeWorker() external onlyOwner {
        worker = address(0);
    }
}
