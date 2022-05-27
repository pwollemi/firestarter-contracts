// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "./libraries/AddressPagination.sol";
import "./interfaces/IFirestarterSFT.sol";

contract FirestarterSFTVesting is Initializable {
    using AddressPagination for address[];
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
    /// @notice FirestarterSFT
    IFirestarterSFT public vestingSFT;

    /// @notice Owner address(presale)
    address public owner;

    /// @notice Sum of all user's vesting amount
    uint256 public totalVestingAmount;

    // Participants list
    address[] internal participants;
    mapping(address => uint256) internal indexOf;
    mapping(address => bool) internal inserted;

    /// @notice Worker's address allowed to modify whitelist
    address public worker;

    /// @notice An event emitted when the vesting schedule is updated.
    event VestingInfoUpdated(address indexed registeredAddress, uint256 totalAmount);

    /// @notice An event emitted when withdraw happens
    event Withdraw(address indexed registeredAddress, uint256 amountWithdrawn);

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
        address _vestingSFT,
        VestingParams memory _params
    ) external initializer {
        require(_rewardToken != address(0), "initialize: rewardToken cannot be zero");
        require(_params.releaseRate > 0, "initialize: release rate cannot be zero");
        require(_params.releaseInterval > 0, "initialize: release interval cannot be zero");

        owner = msg.sender;
        rewardToken = _rewardToken;
        vestingSFT = IFirestarterSFT(_vestingSFT);

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
    function getParticipants(uint256 page, uint256 limit) external view returns (address[] memory) {
        return participants.paginate(page, limit);
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
     * @param recp Address of Recipient
     * @param amount Amount of reward token
     */
    function updateRecipient(address recp, uint256 amount) external onlyOwnerOrWorker {
        require(
            startTime == 0 || startTime >= block.timestamp,
            "updateRecipient: Cannot update the receipient after started"
        );
        require(amount > 0, "updateRecipient: Cannot vest 0");

        vestingSFT.mint(recp, amount, false);

        totalVestingAmount = totalVestingAmount + amount;

        uint256 depositedAmount = IERC20Upgradeable(rewardToken).balanceOf(address(this));
        require(
            depositedAmount >= totalVestingAmount,
            "updateRecipient: Vesting amount exceeds current balance"
        );

        if (inserted[recp] == false) {
            inserted[recp] = true;
            indexOf[recp] = participants.length;
            participants.push(recp);
        }

        emit VestingInfoUpdated(recp, amount);
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
        IFirestarterSFT.VestingInfo memory vestingInfo = vestingSFT.getVestingInfo(tokenId);

        if (vestingInfo.totalAmount == 0) return;

        uint256 _vested = vested(tokenId);
        uint256 _withdrawable = _vested - vestingInfo.amountWithdrawn;

        require(_withdrawable > 0, "Nothing to withdraw");
        address beneficiary = IERC721Upgradeable(address(vestingSFT)).ownerOf(tokenId);
        vestingSFT.updateAmountWithdrawn(tokenId, _vested);

        IERC20Upgradeable(rewardToken).safeTransfer(beneficiary, _withdrawable);
        emit Withdraw(beneficiary, _withdrawable);
    }

    /**
     * @notice Returns the amount of vested reward tokens
     * @dev Calculates available amount depending on vesting params
     * @param tokenId SFT tokenId
     * @return amount : Amount of vested tokens
     */
    function vested(uint256 tokenId) public view virtual returns (uint256 amount) {
        IFirestarterSFT.VestingInfo memory vestingInfo = vestingSFT.getVestingInfo(tokenId);

        uint256 lockEndTime = startTime + lockPeriod;
        uint256 vestingEndTime = lockEndTime + vestingPeriod;

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

        uint256 withdrawnAmount = vestingInfo.amountWithdrawn;
        vestedAmount = withdrawnAmount > vestedAmount ? withdrawnAmount : vestedAmount;

        return vestedAmount > vestingInfo.totalAmount ? vestingInfo.totalAmount : vestedAmount;
    }

    /**
     * @notice Return locked amount
     * @return Locked reward token amount
     */
    function locked(uint256 tokenId) public view returns (uint256) {
        IFirestarterSFT.VestingInfo memory vestingInfo = vestingSFT.getVestingInfo(tokenId);

        uint256 totalAmount = vestingInfo.totalAmount;
        uint256 vestedAmount = vested(tokenId);
        return totalAmount - vestedAmount;
    }

    /**
     * @notice Return remaining withdrawable amount
     * @return Remaining vested amount of reward token
     */
    function withdrawable(uint256 tokenId) public view returns (uint256) {
        IFirestarterSFT.VestingInfo memory vestingInfo = vestingSFT.getVestingInfo(tokenId);

        uint256 vestedAmount = vested(tokenId);
        uint256 withdrawnAmount = vestingInfo.amountWithdrawn;
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
