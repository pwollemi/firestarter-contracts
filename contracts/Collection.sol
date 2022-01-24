// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/ICollection.sol";


contract Collection is ICollection, ERC721Upgradeable, OwnableUpgradeable {

    address public minter;

    modifier onlyMinter() {
        require(_msgSender() == minter, "Not Minter!");
        _;
    }

    function initialize(string memory name, string memory symbol) external initializer {
        __Ownable_init();
        __ERC165_init_unchained();
        __ERC721_init_unchained(name, symbol);

        minter = msg.sender;
    }

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    function mint(address to, uint256 tokenId) override external onlyMinter {
        _safeMint(to, tokenId);
    }
}