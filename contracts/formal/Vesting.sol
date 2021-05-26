// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vesting is Context, Ownable {
    using SafeMath for uint256;

    struct VestingSchedule {
        uint256 totalAmount; // Total amount of tokens to be vested.
        uint256 amountWithdrawn; // The amount that has been withdrawn.
    }

    mapping(address => VestingSchedule) public recipients;

    uint256 public startTime;
    bool public isStartTimeSet;
    uint256 public withdrawInterval; // Amount of time in seconds between withdrawal periods.
    uint256 public releaseRate; // Release percent in each withdrawing interval

    uint256 public totalAmount; // Total amount of tokens to be vested.
    uint256 public unallocatedAmount; // The amount of tokens that are not allocated yet.
    uint256 public initialUnlock; // Percent of tokens initially unlocked

    IERC20 public token;

    event VestingScheduleRegistered(
        address registeredAddress,
        uint256 totalAmount
    );
    event VestingSchedulesRegistered(
        address[] registeredAddresses,
        uint256[] totalAmounts
    );
    event Withdraw(address registeredAddress, uint256 amountWithdrawn);
    event StartTimeSet(uint256 startTime);

    constructor(
        address _token,
        uint256 _totalAmount,
        uint256 _initialUnlock,
        uint256 _withdrawInterval,
        uint256 _releaseRate
    ) {
        require(_totalAmount > 0);
        require(_withdrawInterval > 0);

        token = IERC20(_token);

        totalAmount = _totalAmount;
        initialUnlock = _initialUnlock;
        unallocatedAmount = _totalAmount;
        withdrawInterval = _withdrawInterval;
        releaseRate = _releaseRate;

        isStartTimeSet = false;
    }

    function addRecipient(address _newRecipient, uint256 _totalAmount)
        external
        onlyOwner
    {
        // Only allow to add recipient before the counting starts
        require(!isStartTimeSet || startTime > block.timestamp);

        require(_newRecipient != address(0));

        unallocatedAmount = unallocatedAmount.add(
            recipients[_newRecipient].totalAmount
        );
        require(_totalAmount > 0 && _totalAmount <= unallocatedAmount);

        recipients[_newRecipient] = VestingSchedule({
            totalAmount: _totalAmount,
            amountWithdrawn: 0
        });
        unallocatedAmount = unallocatedAmount.sub(_totalAmount);

        emit VestingScheduleRegistered(_newRecipient, _totalAmount);
    }

    function addRecipients(
        address[] memory _newRecipients,
        uint256[] memory _totalAmounts
    ) external onlyOwner {
        // Only allow to add recipient before the counting starts
        require(!isStartTimeSet || startTime > block.timestamp);

        for (uint256 i = 0; i < _newRecipients.length; i++) {
            address _newRecipient = _newRecipients[i];
            uint256 _totalAmount = _totalAmounts[i];

            require(_newRecipient != address(0));

            unallocatedAmount = unallocatedAmount.add(
                recipients[_newRecipient].totalAmount
            );
            require(_totalAmount > 0 && _totalAmount <= unallocatedAmount);

            recipients[_newRecipient] = VestingSchedule({
                totalAmount: _totalAmount,
                amountWithdrawn: 0
            });
            unallocatedAmount = unallocatedAmount.sub(_totalAmount);
        }

        emit VestingSchedulesRegistered(_newRecipients, _totalAmounts);
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
            (block.timestamp < startTime)
        ) {
            return 0;
        }

        uint256 initialUnlockAmount =
            _vestingSchedule.totalAmount.mul(initialUnlock).div(100);

        uint256 unlockRate =
            _vestingSchedule.totalAmount.mul(releaseRate).div(100).div(
                withdrawInterval
            );

        uint256 vestedAmount =
            unlockRate.mul(block.timestamp - startTime).add(
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
        require(token.transfer(_msgSender(), _withdrawable));
        emit Withdraw(_msgSender(), _withdrawable);
    }
}
