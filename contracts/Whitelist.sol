// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./libraries/AddressPagination.sol";

/// @title Firestarter WhiteList Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract to manage whitelisted users
/// @dev All function calls are currently implemented without side effects
contract Whitelist is Initializable, OwnableUpgradeable {
    using AddressPagination for address[];

    struct UserData {
        // User wallet address
        address wallet;
        // Flag for KYC status
        bool isKycPassed;
        // Max allocation for this user in public presale
        uint256 publicMaxAlloc;
        // Flag if this user is allowed to participate in private presale
        bool allowedPrivateSale;
        // Max allocation for this user in private presale
        uint256 privateMaxAlloc;
    }

    /// @notice Maximum input array length(used in `addToWhitelist`, `removeFromWhitelist`)
    uint256 public constant MAX_ARRAY_LENGTH = 50;

    /// @notice Count of users participating in whitelisting
    uint256 public totalUsers;

    /// @dev White List
    mapping(address => UserData) private whitelistedUsers;

    // Users list
    address[] internal userlist;
    mapping(address => uint256) internal indexOf;
    mapping(address => bool) internal inserted;

    /// @notice Worker's address allowed to modify whitelist
    address public worker;

    /// @notice An event emitted when a user is added or removed. True: Added, False: Removed
    event AddedOrRemoved(bool added, address indexed user, uint256 timestamp);

    /**
     * @dev Throws if called by any account other than the owner or the worker.
     */
    modifier onlyOwnerOrWorker() {
        require(owner() == _msgSender() || worker == _msgSender(), "Whitelist: caller is not the owner nor the worker");
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
    }

    /**
     * @notice Return the number of users
     */
    function usersCount() external view returns (uint256) {
        return userlist.length;
    }

    /**
     * @notice Return the list of users
     */
    function getUsers(uint256 page, uint256 limit) external view returns (address[] memory) {
        return userlist.paginate(page, limit);
    }

    /**
     * @notice Add users to white list
     * @dev Only owner can do this operation
     * @param users List of user data
     */
    function addToWhitelist(UserData[] memory users) external onlyOwnerOrWorker {
        require(
            users.length <= MAX_ARRAY_LENGTH,
            "addToWhitelist: users length shouldn't exceed MAX_ARRAY_LENGTH"
        );

        for (uint256 i = 0; i < users.length; i++) {
            UserData memory user = users[i];
            whitelistedUsers[user.wallet] = user;

            if (inserted[user.wallet] == false) {
                inserted[user.wallet] = true;
                indexOf[user.wallet] = userlist.length;
                userlist.push(user.wallet);
            }

            emit AddedOrRemoved(true, user.wallet, block.timestamp);
        }
        totalUsers = userlist.length;
    }

    /**
     * @notice Remove from white lsit
     * @dev Only owner can do this operation
     * @param addrs addresses to be removed
     */
    function removeFromWhitelist(address[] memory addrs) external onlyOwnerOrWorker {
        require(
            addrs.length <= MAX_ARRAY_LENGTH,
            "removeFromWhitelist: users length shouldn't exceed MAX_ARRAY_LENGTH"
        );

        for (uint256 i = 0; i < addrs.length; i++) {
            // Ignore for non-existing users
            if (whitelistedUsers[addrs[i]].wallet != address(0)) {
                delete whitelistedUsers[addrs[i]];
                emit AddedOrRemoved(false, addrs[i], block.timestamp);
            }
            if (inserted[addrs[i]] == true) {
                delete inserted[addrs[i]];

                uint256 index = indexOf[addrs[i]];
                uint256 lastIndex = userlist.length - 1;
                address lastUser = userlist[lastIndex];

                indexOf[lastUser] = index;
                delete indexOf[addrs[i]];

                userlist[index] = lastUser;
                userlist.pop();
            }
        }
        totalUsers = userlist.length;
    }

    /**
     * @notice Return whitelisted user info
     * @param _user user wallet address
     * @return user wallet, kyc status, max allocation
     */
    function getUser(address _user)
        external
        view
        returns (
            address,
            bool,
            uint256,
            bool,
            uint256
        )
    {
        return (
            whitelistedUsers[_user].wallet,
            whitelistedUsers[_user].isKycPassed,
            whitelistedUsers[_user].publicMaxAlloc,
            whitelistedUsers[_user].allowedPrivateSale,
            whitelistedUsers[_user].privateMaxAlloc
        );
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
