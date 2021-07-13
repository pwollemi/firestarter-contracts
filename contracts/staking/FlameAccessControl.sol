//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract FlameAccessControl is AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    event AdminRoleGranted(address indexed beneficiary, address indexed caller);

    event AdminRoleRemoved(address indexed beneficiary, address indexed caller);

    event ManagerRoleGranted(
        address indexed beneficiary,
        address indexed caller
    );

    event ManagerRoleRemoved(
        address indexed beneficiary,
        address indexed caller
    );

    event MinterRoleGranted(
        address indexed beneficiary,
        address indexed caller
    );

    event MinterRoleRemoved(
        address indexed beneficiary,
        address indexed caller
    );

    /**
     * @notice The deployer is automatically given the admin role which will allow them to then grant roles to other addresses
     */
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * @notice Used to check whether an address has the admin role
     * @param _address EOA or contract being checked
     * @return bool True if the account has the role or false if it does not
     */
    function hasAdminRole(address _address) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice Used to check whether an address has the manager role
     * @param _address EOA or contract being checked
     * @return bool True if the account has the role or false if it does not
     */
    function hasManagerRole(address _address) external view returns (bool) {
        return hasRole(MANAGER_ROLE, _address);
    }

    /**
     * @notice Used to check whether an address has the minter role
     * @param _address EOA or contract being checked
     * @return bool True if the account has the role or false if it does not
     */
    function hasMinterRole(address _address) external view returns (bool) {
        return hasRole(MINTER_ROLE, _address);
    }

    ///////////////
    // Modifiers //
    ///////////////

    /**
     * @notice Grants the admin role to an address
     * @dev The sender must have the admin role
     * @param _address EOA or contract receiving the new role
     */
    function addAdminRole(address _address) external {
        grantRole(DEFAULT_ADMIN_ROLE, _address);
        emit AdminRoleGranted(_address, _msgSender());
    }

    /**
     * @notice Removes the admin role from an address
     * @dev The sender must have the admin role
     * @param _address EOA or contract affected
     */
    function removeAdminRole(address _address) external {
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
        emit AdminRoleRemoved(_address, _msgSender());
    }

    /**
     * @notice Grants the manager role to an address
     * @dev The sender must have the admin role
     * @param _address EOA or contract receiving the new role
     */
    function addManagerRole(address _address) external {
        grantRole(MANAGER_ROLE, _address);
        emit ManagerRoleGranted(_address, _msgSender());
    }

    /**
     * @notice Removes the manager role from an address
     * @dev The sender must have the admin role
     * @param _address EOA or contract affected
     */
    function removeManagerRole(address _address) external {
        revokeRole(MANAGER_ROLE, _address);
        emit ManagerRoleRemoved(_address, _msgSender());
    }

    /**
     * @notice Grants the minter role to an address
     * @dev The sender must have the admin role
     * @param _address EOA or contract receiving the new role
     */
    function addMinterRole(address _address) external {
        grantRole(MINTER_ROLE, _address);
        emit MinterRoleGranted(_address, _msgSender());
    }

    /**
     * @notice Removes the minter role from an address
     * @dev The sender must have the admin role
     * @param _address EOA or contract affected
     */
    function removeMinterRole(address _address) external {
        revokeRole(MINTER_ROLE, _address);
        emit MinterRoleRemoved(_address, _msgSender());
    }
}
