// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@charged-particles/erc721i/contracts/ERC721i.sol";

contract EasyMint is ERC721i {
    constructor(
        string memory name,
        string memory symbol,
        address minter,
        uint256 maxSupply
    ) ERC721i(name, symbol, minter, maxSupply) {}

    function preMint() external {
        _preMint();
    }
}
