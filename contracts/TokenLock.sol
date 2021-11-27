// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/// @title Token locking contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract to apply locking to any ERC20 token
/// @dev All function calls are currently implemented without side effects
contract TokenLock is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

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

    /// @notice Lock expire time for a wallet
    mapping(address => uint256) public lockExpiresAt;

    /// @notice Owner of this contract
    address public owner;

    /// @notice Worker's address allowed to set lock period
    address public worker;

    /**
     * @dev Throws if called by any account other than the owner or the worker.
     */
    modifier onlyOwnerOrWorker() {
        require(owner == msg.sender || worker == msg.sender, "TokenLock: caller is not the owner nor the worker");
        _;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can do this");
        _;
    }

    /// @notice An event emitted when token is locked
    event Locked(address indexed locker, uint256 amount);

    /// @notice An event emitted when token is unlocked
    event Unlocked(address indexed locker, uint256 amount);

    /// @notice An event emitted when lock is set
    event LockExpiresAt(address indexed wallet, uint256 timestamp);

    function initialize(address _token) external initializer {
        require(_token != address(0), "initialize: token address cannot be zero");
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
    function getPenalty(address _addr) external view returns (uint256, uint256) {
        LockInfo memory lockInfo = lockedBalance[_addr];

        require(lockInfo.amount > 0, "Not locked");

        uint256 penaltyRate = _getPenaltyRate(block.timestamp - lockInfo.lastLockedTime);
        uint256 penalty = (lockInfo.amount * penaltyRate) / 100;

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
        LockInfo storage lockInfo = lockedBalance[msg.sender];
        lockInfo.amount = lockInfo.amount + _amount;
        lockInfo.lastLockedTime = block.timestamp;
        totalLocked = totalLocked + _amount;

        emit Locked(msg.sender, _amount);

        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @notice unlock current tokens
     */
    function unlock(uint256 _amount) external {
        LockInfo storage lockInfo = lockedBalance[msg.sender];

        require(lockInfo.amount > 0, "Not locked");
        require(lockInfo.amount >= _amount, "Exceeds locked amount");
        require(lockExpiresAt[msg.sender] <= block.timestamp, "Still in the lock period");

        totalLocked = totalLocked - _amount;
        lockInfo.amount = lockInfo.amount - _amount;

        emit Unlocked(msg.sender, _amount);

        uint256 penaltyRate = _getPenaltyRate(block.timestamp - lockInfo.lastLockedTime);
        uint256 penalty = (_amount * penaltyRate) / 100;
        uint256 unlocked = _amount - penalty;

        // transfer unlocked amount to user
        IERC20Upgradeable(token).safeTransfer(msg.sender, unlocked);

        // burn penalty
        if (penalty > 0) {
            IERC20Upgradeable(token).safeTransfer(address(0xdead), penalty);
        }
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

    /**
     * @notice setOwner
     * @dev can call this when owner is not set or only by the current owner
     * @param _owner new owner
     */
    function setOwner(address _owner) external  {
        require(msg.sender == owner || owner == address(0), "You're not owner or owner is already set to another person");
        owner = _owner;
    }

    /**
     * @notice set lock expiring time of a wallet
     * @param wallet to set lock expiring time
     * @param timestamp of being unlocked
     */
    function setLockExpiresAt(address wallet, uint256 timestamp) external onlyOwnerOrWorker {
        _setLockExpiresAt(wallet, timestamp);
    }

    /**
     * @notice set lock period of several wallets
     * @param wallets to set lock period
     * @param timestamps of being unlocked
     */
    function setBatchLockExpiresAt(address[] memory wallets, uint256[] memory timestamps) external onlyOwnerOrWorker {
        require(wallets.length <= 100, "Input array length shouldn't exceed 100");
        for (uint256 i = 0; i < wallets.length; i = i + 1) {
            _setLockExpiresAt(wallets[i], timestamps[i]);
        }
    }

    function _setLockExpiresAt(address wallet, uint256 timestamp) internal {
        lockExpiresAt[wallet] = timestamp;
        emit LockExpiresAt(wallet, timestamp);
    }
}
