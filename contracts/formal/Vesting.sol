// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vesting is Context {
    using SafeMath for uint256;

    address private owner;
    struct VestingSchedule {
        uint256 totalAmount; // Total amount of tokens to be vested.
        uint256 amountWithdrawn; // The amount that has been withdrawn.
    }

    mapping(address => VestingSchedule) public recipients;

    uint256 public startTime;
    bool public isStartTimeSet;
    uint256 public withdrawInterval; // Amount of time in seconds between withdrawal periods.
    uint256 public releaseRate; // Release percent in each withdrawing interval
    uint256 public initialUnlock; // Percent of tokens initially unlocked
    uint256 public lockPeriod; // Number of periods before start release.

    IERC20 public RT;

    event VestingScheduleUpdated(
        address registeredAddress,
        uint256 totalAmount
    );

    event Withdraw(address registeredAddress, uint256 amountWithdrawn);
    event StartTimeSet(uint256 startTime);

    /********************** Modifiers ***********************/
    modifier onlyOwner() {
        require(owner == _msgSender(), "Requires Owner Role");
        _;
    }

    constructor(address _RT, uint256[4] memory _vestingParams) {
        require(_vestingParams[1] > 0);

        owner = _msgSender();
        RT = IERC20(_RT);

        initialUnlock = _vestingParams[0];
        withdrawInterval = _vestingParams[1];
        releaseRate = _vestingParams[2];
        lockPeriod = _vestingParams[3];

        isStartTimeSet = false;
    }

    function transferOwnership(address _owner) external onlyOwner {
        owner = _owner;
    }

    function updateRecipient(address _recipient, uint256 _amount)
        external
        onlyOwner
    {
        require(
            !isStartTimeSet || startTime > block.timestamp,
            "updateRecipient: Cannot update the receipient after started"
        );
        require(_amount > 0, "updateRecipient: Cannot vest 0");
        recipients[_recipient].totalAmount = _amount;
        emit VestingScheduleUpdated(_recipient, _amount);
    }

    function setStartTime(uint256 _newStartTime) external onlyOwner {
        // Only allow to change start time before the counting starts
        require(!isStartTimeSet || startTime > block.timestamp);
        require(_newStartTime > block.timestamp);

        startTime = _newStartTime;
        isStartTimeSet = true;

        emit StartTimeSet(_newStartTime);
    }

    // Returns the amount of tokens you can withdraw
    function vested(address beneficiary)
        public
        view
        virtual
        returns (uint256 _amountVested)
    {
        VestingSchedule memory _vestingSchedule = recipients[beneficiary];
        if (
            !isStartTimeSet ||
            (_vestingSchedule.totalAmount == 0) ||
            (block.timestamp < startTime) ||
            (block.timestamp < startTime.add(lockPeriod))
        ) {
            return 0;
        }

        uint256 initialUnlockAmount =
            _vestingSchedule.totalAmount.mul(initialUnlock).div(1e6);

        uint256 unlockRate =
            _vestingSchedule.totalAmount.mul(releaseRate).div(1e6).div(
                withdrawInterval
            );

        uint256 vestedAmount =
            unlockRate.mul(block.timestamp.sub(startTime).sub(lockPeriod)).add(
                initialUnlockAmount
            );

        if (vestedAmount > _vestingSchedule.totalAmount) {
            return _vestingSchedule.totalAmount;
        }
        return vestedAmount;
    }

    function locked(address beneficiary) public view returns (uint256 amount) {
        return recipients[beneficiary].totalAmount.sub(vested(beneficiary));
    }

    function withdrawable(address beneficiary)
        public
        view
        returns (uint256 amount)
    {
        return vested(beneficiary).sub(recipients[beneficiary].amountWithdrawn);
    }

    function withdraw() external {
        VestingSchedule storage vestingSchedule = recipients[_msgSender()];
        if (vestingSchedule.totalAmount == 0) return;

        uint256 _vested = vested(_msgSender());
        uint256 _withdrawable = withdrawable(_msgSender());
        vestingSchedule.amountWithdrawn = _vested;

        require(_withdrawable > 0, "Nothing to withdraw");
        require(RT.transfer(_msgSender(), _withdrawable));
        emit Withdraw(_msgSender(), _withdrawable);
    }
}
