pragma solidity ^0.7.6;

//
interface IBEP20 {
    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

/*
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with GSN meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    // Empty internal constructor, to prevent people from mistakenly deploying
    // an instance of this contract, which should be used via inheritance.
    constructor() {}

    function _msgSender() internal view returns (address payable) {
        return msg.sender;
    }

    function _msgData() internal view returns (bytes memory) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        return msg.data;
    }
}

/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow
 * checks.
 *
 * Arithmetic operations in Solidity wrap on overflow. This can easily result
 * in bugs, because programmers usually assume that an overflow raises an
 * error, which is the standard behavior in high level programming languages.
 * `SafeMath` restores this intuition by reverting the transaction when an
 * operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeMath {
    /**
     * @dev Returns the addition of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `+` operator.
     *
     * Requirements:
     * - Addition cannot overflow.
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting with custom message on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     */
    function sub(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     * - Multiplication cannot overflow.
     */
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts with custom message on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function div(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        // Solidity only automatically asserts when dividing by 0
        require(b > 0, errorMessage);
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        return mod(a, b, "SafeMath: modulo by zero");
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts with custom message when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function mod(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        require(b != 0, errorMessage);
        return a % b;
    }
}

contract FlameLocking is Context {
    using SafeMath for uint256;
    IBEP20 flameToken;

    struct LockInfo {
        uint256 amount;
        uint256 lastLockedTime;
    }

    mapping(address => LockInfo) lockedBalance;
    uint256 totalLocked;
    event Locked(address locker, uint256 amount);
    event Unlocked(address locker, uint256 amount);

    constructor(IBEP20 _flameToken) {
        flameToken = _flameToken;
    }

    /**
     * @notice calculate locked amount for address
     * @return _total
     */
    function getLockedAmount(address _addr) external view returns (uint256) {
        return lockedBalance[_addr].amount;
    }

    /**
     * @notice calculate last deposit and penalty amount for address
     * @return _total
     */
    function getPenalty(address _addr)
        external
        view
        returns (uint256, uint256)
    {
        LockInfo memory _lock = lockedBalance[_addr];

        require(_lock.amount > 0, "Not locked");

        uint256 passed = block.timestamp - _lock.lastLockedTime;
        uint256 amount = _lock.amount;
        uint256 penalty;
        if (passed < 10 days) {
            penalty = amount.mul(10).div(100);
        } else if (passed < 20 days) {
            penalty = amount.mul(5).div(100);
        } else if (passed < 30 days) {
            penalty = amount.mul(2).div(100);
        } else {
            penalty = 0;
        }

        return (_lock.lastLockedTime, penalty);
    }

    /**
     * @notice calculate entire locked amount
     * @return _total
     */
    function getTotalLocked() external view returns (uint256) {
        return totalLocked;
    }

    /**
     * @notice lock FLAME
     * @param _amount is the flame amount to lock
     */
    function lock(uint256 _amount) external {
        require(
            flameToken.transferFrom(_msgSender(), address(this), _amount),
            "FlameLocking: flameToken.TransferFrom: Failed to lock!"
        );
        LockInfo storage _lock = lockedBalance[_msgSender()];

        _lock.lastLockedTime = block.timestamp;

        _lock.amount = _lock.amount.add(_amount);

        totalLocked = totalLocked.add(_amount);
        emit Locked(_msgSender(), _amount);
    }

    /**
     * @notice unlock current tokens
     */
    function unlock(uint256 _amount) external {
        LockInfo storage _lock = lockedBalance[_msgSender()];

        require(_lock.amount > 0, "Not locked");
        require(_lock.amount >= _amount, "Exceeds locked amount");

        uint256 passed = block.timestamp - _lock.lastLockedTime;

        uint256 unlocked;
        if (passed < 10 days) {
            unlocked = _amount.mul(90).div(100);
        } else if (passed < 20 days) {
            unlocked = _amount.mul(95).div(100);
        } else if (passed < 30 days) {
            unlocked = _amount.mul(98).div(100);
        } else {
            unlocked = _amount;
        }

        require(
            flameToken.transfer(_msgSender(), unlocked),
            "FlameLocking: flameToken.Transfer: Failed to unlock!"
        );

        if (unlocked < _amount) {
            require(
                flameToken.transfer(address(0xdead), _amount.sub(unlocked)),
                "FlameLocking: flameToken.Transfer: Failed to burn!"
            );
        }

        totalLocked = totalLocked.sub(_amount);
        _lock.amount = _lock.amount.sub(_amount);

        emit Unlocked(_msgSender(), _amount);
    }
}
