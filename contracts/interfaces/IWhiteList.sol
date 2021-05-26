// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

interface IWhitelist {
    function addToWhitelist(address[] memory, uint256[] memory) external;

    function removeFromWhitelist(address[] memory _user) external;

    event AddedOrRemoved(bool, address[], uint256[], uint256); // 1: Added, 0: Removed
}
