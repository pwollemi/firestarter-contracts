// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface ICollection is IERC721Upgradeable {
    function mint(address to, uint256 tokenId) external;
}