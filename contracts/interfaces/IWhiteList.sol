// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

interface IWhitelist {
    function addToWhitelist(address[] memory, uint256[] memory) external;

    function removeFromWhitelist(address[] memory _user) external;

    function isUserInWL(address _user) external view returns (bool);

    function getUser(address _user)
        external
        view
        returns (
            address,
            bool,
            uint256
        );

    event AddedOrRemoved(bool, address, uint256); // 1: Added, 0: Removed
}
