// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFirestarterSFT {
    function withdraw(uint256 tokenId) external;

    function vested(uint256 tokenId) external view returns(uint256);

    function locked(uint256 tokenId) external view returns (uint256);

    function withdrawable(uint256 tokenId) external view returns (uint256)
}
