// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

interface IWhiteList {
    function addToWhiteList(address _user) external;
    function removeFromWhiteList(address _user) external;

    event AddedOrRemoved(address indexed, bool, uint256); // 1: Added, 0: Removed
}
