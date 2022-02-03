// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/ICollection.sol";


contract Collection is ICollection, ERC721EnumerableUpgradeable, OwnableUpgradeable {

    address public minter;

    string private _baseTokenURI;

    modifier onlyMinter() {
        require(_msgSender() == minter, "Not Minter!");
        _;
    }

    function initialize(string memory name, string memory symbol) external initializer {
        __Ownable_init();
        __ERC165_init_unchained();
        __ERC721_init_unchained(name, symbol);
        __ERC721Enumerable_init_unchained();

        minter = msg.sender;
    }

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    function mint(address to, uint256 tokenId) override external onlyMinter {
        _safeMint(to, tokenId);
    }

    function setBaseTokenURI(string calldata _newBaseURI) external onlyOwner {
        _baseTokenURI = _newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}