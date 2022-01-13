// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IVesting {
    function updateRecipient(address, uint256) external;

    function setStartTime(uint256) external;
}
