// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IERC20.sol";

/// @title Firestarter Vesting Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for token vesting
/// @dev All function calls are currently implemented without side effects
contract Vesting is Initializable {
    using SafeMath for uint256;

    struct VestingParams {
        // Name of this tokenomics
        string vestingName;
        // Total amount to be vested
        uint256 amountToBeVested;
        // Percent of tokens initially unlocked
        uint256 initialUnlock;
        // Amount of time in seconds between withdrawal periods.
        uint256 withdrawInterval;
        // Release percent in each withdrawing interval
        uint256 releaseRate;
        // Number of periods before start release.
        uint256 lockPeriod;
    }

    struct VestingInfo {
        // Total amount of tokens to be vested.
        uint256 totalAmount;
        // The amount that has been withdrawn.
        uint256 amountWithdrawn;
    }

    /// @notice General decimal values accuracy unless specified differently (e.g. fees, exchange rates)
    uint256 public constant accuracy = 1e10;

    /*************************** Vesting Params *************************/

    /// @notice Total balance of this vesting contract
    uint256 public amountToBeVested;

    /// @notice Name of this vesting
    string public vestingName;

    /// @notice Start time of vesting
    uint256 public startTime;

    /// @notice Amount of time in seconds between withdrawal periods.
    uint256 public withdrawInterval;

    /// @notice Release percent in each withdrawing interval
    uint256 public releaseRate;

    /// @notice Percent of tokens initially unlocked
    uint256 public initialUnlock;

    /// @notice Number of periods before start release.
    uint256 public lockPeriod;

    /// @notice Reward token of the project.
    address public rewardToken;

    /*************************** Status Info *************************/

    /// @notice Owner address(presale)
    address public owner;

    /// @notice Sum of all user's vesting amount
    uint256 public totalVestingAmount;

    /// @notice Vesting schedule info for each user(presale)
    mapping(address => VestingInfo) public recipients;
    address[] internal participants;
    mapping(address => uint256) internal indexOf;

    /// @notice An event emitted when the vesting schedule is updated.
    event VestingInfoUpdated(address registeredAddress, uint256 totalAmount);

    /// @notice An event emitted when withdraw happens
    event Withdraw(address registeredAddress, uint256 amountWithdrawn);

    /// @notice An event emitted when startTime is set
    event StartTimeSet(uint256 startTime);

    modifier onlyOwner() {
        require(owner == msg.sender, "Requires Owner Role");
        _;
    }

    function initialize(address _rewardToken, VestingParams memory _params) external initializer {
        require(_params.withdrawInterval > 0);

        owner = msg.sender;
        rewardToken = _rewardToken;

        vestingName = _params.vestingName;
        amountToBeVested = _params.amountToBeVested;
        initialUnlock = _params.initialUnlock;
        withdrawInterval = _params.withdrawInterval;
        releaseRate = _params.releaseRate;
        lockPeriod = _params.lockPeriod;
    }

    /**
     * @notice Return the number of participants
     */
    function participantsLength() external view returns (uint256) {
        return participants.length;
    }

    /**
     * @notice Return the list of participants
     */
    function getParticipants() external view returns (address[] memory) {
        return participants;
    }

    /**
     * @notice Init Presale contract
     * @dev Thic changes the owner to presale
     * @param presale Presale contract address
     */
    function init(address presale) external onlyOwner {
        owner = presale;
        IERC20(rewardToken).approve(presale, type(uint256).max);
    }

    /**
     * @notice Update user vesting information
     * @dev This is called by presale contract
     * @param recp Address of Recipient
     * @param amount Amount of reward token
     */
    function updateRecipient(address recp, uint256 amount) external onlyOwner {
        require(
            startTime == 0 || startTime >= block.timestamp,
            "updateRecipient: Cannot update the receipient after started"
        );
        require(amount > 0, "updateRecipient: Cannot vest 0");

        // remove previous amount and add new amount
        totalVestingAmount = totalVestingAmount
        .sub(recipients[recp].totalAmount)
        .add(amount);

        uint256 depositedAmount = IERC20(rewardToken).balanceOf(address(this));
        require(
            depositedAmount >= totalVestingAmount,
            "updateRecipient: Vesting amount exceeds current balance"
        );

        if (recipients[recp].totalAmount == 0) {
            indexOf[recp] = participants.length;
            participants.push(recp);
        }

        recipients[recp].totalAmount = amount;

        emit VestingInfoUpdated(recp, amount);
    }

    /**
     * @notice Set vesting start time
     * @dev This should be called before vesting starts
     * @param newStartTime New start time
     */
    function setStartTime(uint256 newStartTime) external onlyOwner {
        // Check if enough amount is deposited to this contract
        // require(IERC20(rewardToken).balanceOf(address(this)) >= amountToBeVested, "setStartTime: Enough amount of reward token should be vested.");

        // Only allow to change start time before the counting starts
        require(
            startTime == 0 || startTime >= block.timestamp,
            "setStartTime: Already started"
        );
        require(
            newStartTime > block.timestamp,
            "setStartTime: Should be time in future"
        );

        startTime = newStartTime;

        emit StartTimeSet(newStartTime);
    }

    /**
     * @notice Withdraw tokens when vesting is ended
     * @dev Anyone can claim their tokens
     * Warning: Take care of re-entrancy attack here.
     * Reward tokens are from not our own, which means
     * re-entrancy can happen when the transfer happens.
     * For now, we do checks-effects-interactsions, but
     * for absolute safety, we may use reentracny guard.
     */
    function withdraw() external {
        VestingInfo storage vestingInfo = recipients[msg.sender];
        if (vestingInfo.totalAmount == 0) return;

        uint256 _vested = vested(msg.sender);
        uint256 _withdrawable = withdrawable(msg.sender);
        vestingInfo.amountWithdrawn = _vested;

        require(_withdrawable > 0, "Nothing to withdraw");
        require(IERC20(rewardToken).transfer(msg.sender, _withdrawable));
        emit Withdraw(msg.sender, _withdrawable);
    }

    /**
     * @notice Returns the amount of vested reward tokens
     * @dev Calculates available amount depending on vesting params
     * @param beneficiary address of the beneficiary
     * @return amount : Amount of vested tokens
     */
    function vested(address beneficiary)
        public
        view
        virtual
        returns (uint256 amount)
    {
        uint256 endTime = startTime.add(lockPeriod);
        VestingInfo memory vestingInfo = recipients[beneficiary];

        if (
            startTime == 0 ||
            vestingInfo.totalAmount == 0 ||
            block.timestamp <= endTime
        ) {
            return 0;
        }

        uint256 initialUnlockAmount = vestingInfo
        .totalAmount
        .mul(initialUnlock)
        .div(accuracy);

        uint256 unlockAmountPerInterval = vestingInfo
        .totalAmount
        .mul(releaseRate)
        .div(accuracy);

        uint256 vestedAmount = block.timestamp.sub(endTime).div(withdrawInterval).mul(unlockAmountPerInterval).add(
            initialUnlockAmount
        );

        if (vestedAmount > vestingInfo.totalAmount) {
            return vestingInfo.totalAmount;
        }
        return vestedAmount;
    }

    /**
     * @notice Return locked amount
     * @return Locked reward token amount
     */
    function locked(address beneficiary) public view returns (uint256) {
        uint256 totalAmount = recipients[beneficiary].totalAmount;
        uint256 vestedAmount = vested(beneficiary);
        return totalAmount.sub(vestedAmount);
    }

    /**
     * @notice Return remaining withdrawable amount
     * @return Remaining vested amount of reward token
     */
    function withdrawable(address beneficiary) public view returns (uint256) {
        uint256 vestedAmount = vested(beneficiary);
        uint256 withdrawnAmount = recipients[beneficiary].amountWithdrawn;
        return vestedAmount.sub(withdrawnAmount);
    }
}
