// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title Token locking contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract to apply locking to any ERC20 token
/// @dev All function calls are currently implemented without side effects
contract TokenLock is Initializable {
    using SafeMath for uint256;

    struct LockInfo {
        // locked amount
        uint256 amount;
        // last locked time
        uint256 lastLockedTime;
    }

    /// @notice ERC20 token address
    address public token;

    /// @notice Total locked amount
    uint256 public totalLocked;

    /// @notice Locked Info List
    mapping(address => LockInfo) public lockedBalance;

    /// @notice An event emitted when token is locked
    event Locked(address locker, uint256 amount);

    /// @notice An event emitted when token is unlocked
    event Unlocked(address locker, uint256 amount);

    function initialize(address _token) external initializer {
        token = _token;
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
        LockInfo memory lockInfo = lockedBalance[_addr];

        require(lockInfo.amount > 0, "Not locked");

        uint256 penaltyRate = _getPenaltyRate(block.timestamp - lockInfo.lastLockedTime);
        uint256 penalty = lockInfo.amount.mul(penaltyRate).div(100);

        return (lockInfo.lastLockedTime, penalty);
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
            IERC20(token).transferFrom(msg.sender, address(this), _amount),
            "TokenLock: IERC20(token).TransferFrom: Failed to lock!"
        );

        LockInfo storage lockInfo = lockedBalance[msg.sender];
        lockInfo.amount = lockInfo.amount.add(_amount);
        lockInfo.lastLockedTime = block.timestamp;
        totalLocked = totalLocked.add(_amount);

        emit Locked(msg.sender, _amount);
    }

    /**
     * @notice unlock current tokens
     */
    function unlock(uint256 _amount) external {
        LockInfo storage lockInfo = lockedBalance[msg.sender];

        require(lockInfo.amount > 0, "Not locked");
        require(lockInfo.amount >= _amount, "Exceeds locked amount");

        uint256 penaltyRate = _getPenaltyRate(block.timestamp - lockInfo.lastLockedTime);
        uint256 penalty = _amount.mul(penaltyRate).div(100);
        uint256 unlocked = _amount.sub(penalty);

        // transfer unlocked amount to user
        require(
            IERC20(token).transfer(msg.sender, unlocked),
            "TokenLock: IERC20(token).Transfer: Failed to unlock!"
        );

        // burn penalty
        if (penalty > 0) {
            require(
                IERC20(token).transfer(address(0xdead), penalty),
                "TokenLock: IERC20(token).Transfer: Failed to burn!"
            );
        }

        totalLocked = totalLocked.sub(_amount);
        lockInfo.amount = lockInfo.amount.sub(_amount);

        emit Unlocked(msg.sender, _amount);
    }

    /**
     * @notice calculate penalty rate in percentage
     * @return penalty rate
     */
    function _getPenaltyRate(uint256 passedTime) internal pure returns (uint256) {
        uint256 penaltyRate;

        if (passedTime < 10 days) {
            penaltyRate = 10;
        } else if (passedTime < 20 days) {
            penaltyRate = 5;
        } else if (passedTime < 30 days) {
            penaltyRate = 3;
        } else {
            penaltyRate = 0;
        }

        return penaltyRate;
    }
}
