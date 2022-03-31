// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "./interfaces/IFirestarterSFT.sol";

contract FirestarterSFT is Initializable, OwnableUpgradeable, ERC721EnumerableUpgradeable, IFirestarterSFT {
    address public minter;

    address public vesting;

    string private _baseTokenURI;

    uint256 public vestAmountPerToken;

    mapping(uint256 => VestingInfo) private vestingInfos;

    modifier onlyMinter() {
        require(_msgSender() == minter, "Not Minter!");
        _;
    }

    modifier onlyVesting() {
        require(_msgSender() == vesting, "Not Vesting!");
        _;
    }

    function initialize(
        string memory _name,
        string memory _symbol,
        address _minter,
        address _vesting,
        uint256 _vestAmountPerToken
    ) external initializer {
        __Ownable_init();
        __ERC165_init_unchained();
        __ERC721_init_unchained(_name, _symbol);
        __ERC721Enumerable_init_unchained();

        minter = _minter;
        vesting = _vesting;
        vestAmountPerToken = _vestAmountPerToken;
    }

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    function setVesting(address _vesting) external onlyOwner {
        vesting = _vesting;
    }

    function setBaseTokenURI(string calldata _newBaseURI) external onlyOwner {
        _baseTokenURI = _newBaseURI;
    }

    function mint(
        address to,
        uint256 tokenId,
        uint256 vestAmount
    ) external onlyMinter {
        vestingInfos[tokenId].totalAmount = vestAmount > 0 ? vestAmount : vestAmountPerToken;

        _safeMint(to, tokenId);
    }

    function updateAmountWithdrawn(uint256 _tokenId, uint256 _withdrawn) external override {
        require(_exists(_tokenId), "Nonexistent token");

        VestingInfo storage vestingInfo = vestingInfos[_tokenId];
        uint256 updatedAmount = vestingInfo.amountWithdrawn + _withdrawn;
        require(vestingInfo.totalAmount >= updatedAmount, "Exceed!");

        vestingInfo.amountWithdrawn = updatedAmount;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function getVestingInfo(uint256 _tokenId) public view override returns (VestingInfo memory) {
        return vestingInfos[_tokenId];
    }
}
