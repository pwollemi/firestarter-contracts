// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFirestarterSFT {
    struct VestingInfo {
        // Total amount of tokens to be vested.
        uint256 totalAmount;
        // The amount that has been withdrawn.
        uint256 amountWithdrawn;
        // If true minter can specify the totalAmount after mint
        bool unset;
    }

    function getVestingInfo(uint256 tokenId) external view returns (VestingInfo memory);

    function updateAmountWithdrawn(uint256 tokenId, uint256 withdrawn) external;
}
