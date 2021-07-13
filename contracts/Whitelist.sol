// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/// @title Firestarter WhiteList Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract to manage WL users
/// @dev All function calls are currently implemented without side effects
contract Whitelist is AccessControlEnumerable {
    using SafeMath for uint256;

    struct UserData {
        // User wallet address
        address wallet;
        // Flag for KYC status
        bool isKycPassed;
        // Max allocation for this user
        uint256 MAX_ALLOC;
    }

    /// @notice Count of users participating in whitelisting
    uint256 public totalUsers;

    /// @dev White List
    mapping(address => UserData) private WL;

    /// @notice An event emitted when a user is added or removed. True: Added, False: Removed
    event AddedOrRemoved(bool added, address user, uint256 timestamp);

    modifier onlyOwner() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Requires Owner Role");
        _;
    }

    constructor(address[] memory owners) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        for (uint256 i = 0; i < owners.length; i++) {
            _setupRole(DEFAULT_ADMIN_ROLE, owners[i]);
        }
    }

    /**
     * @notice Add users to white list
     * @dev Only owner can do this operation
     * @param users List of user data
     */
    function addToWhitelist(UserData[] memory users) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            UserData memory user = users[i];
            WL[user.wallet] = user;

            emit AddedOrRemoved(true, user.wallet, block.timestamp);
        }
        totalUsers = totalUsers.add(users.length);
    }

    /**
     * @notice Remove from white lsit
     * @dev Only owner can do this operation
     * @param addrs addresses to be removed
     */
    function removeFromWhitelist(address[] memory addrs) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) {
            // Ignore for non-existing users
            if (WL[addrs[i]].wallet != address(0)) {
                delete WL[addrs[i]];
                totalUsers = totalUsers.sub(1);

                emit AddedOrRemoved(false, addrs[i], block.timestamp);
            }
        }
    }

    /**
     * @notice Return WL user info
     * @param _user user wallet address
     * @return user wallet, kyc status, max allocation
     */
    function getUser(address _user)
        external
        view
        returns (
            address,
            bool,
            uint256
        )
    {
        return (WL[_user].wallet, WL[_user].isKycPassed, WL[_user].MAX_ALLOC);
    }
}
