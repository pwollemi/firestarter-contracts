// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

interface IWhiteList {
    function addToWhiteList(address[] memory, uint256[] memory) external;

    function removeFromWhiteList(address[] memory _user) external;

    event AddedOrRemoved(bool, address[], uint256[], uint256); // 1: Added, 0: Removed
}
