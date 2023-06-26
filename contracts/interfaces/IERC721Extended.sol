// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IERC721Extended is IERC721 {
    function burn(uint256 tokenId) external;
    function mint(address to, uint256 tokenId) external;
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function ignitor() external view returns (address);
}
