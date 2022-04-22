// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "./interfaces/IFirestarterSFT.sol";
import "./interfaces/IFirestarterSFTVesting.sol";

contract FirestarterSFT is Initializable, OwnableUpgradeable, ERC721EnumerableUpgradeable, IFirestarterSFT {
    address public minter;

    IFirestarterSFTVesting public vesting;

    string private _baseTokenURI;

    uint256 public defaultVestAmountPerToken;

    uint256 public nextTokenId;

    mapping(uint256 => VestingInfo) private vestingInfos;

    modifier onlyMinter() {
        require(_msgSender() == minter, "Not Minter!");
        _;
    }

    modifier onlyVesting() {
        require(_msgSender() == address(vesting), "Not Vesting!");
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
        vesting = IFirestarterSFTVesting(_vesting);
        defaultVestAmountPerToken = _vestAmountPerToken;
    }

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    function setVesting(address _vesting) external onlyOwner {
        vesting = IFirestarterSFTVesting(_vesting);
    }

    function setBaseTokenURI(string calldata _newBaseURI) external onlyOwner {
        _baseTokenURI = _newBaseURI;
    }

    function mint(
        address to,
        uint256 vestAmount,
        bool unset
    ) external onlyMinter {
        if(unset) {
            require(vestAmount == 0, "Invalid vestAmount");
        } else {
            vestAmount = vestAmount > 0 ? vestAmount : defaultVestAmountPerToken;
            require(vestAmount > 0, "Vest amount can't be zero");
        }

        vestingInfos[nextTokenId].totalAmount = vestAmount;
        vestingInfos[nextTokenId].unset = unset;

        _safeMint(to, nextTokenId);

        nextTokenId ++;
    }

    function batchMint(
        address[] calldata users,
        uint256[] calldata vestAmounts,
        bool[] calldata unsets
    ) external onlyMinter {
        require(users.length == vestAmounts.length, "Invalid params");
        require(users.length == unsets.length, "Invalid params");

        for(uint256 i = 0; i < users.length; i ++) {
            uint256 vestAmount = 0;
            if(unsets[i]) {
                require(vestAmounts[i] == 0, "Invalid vestAmount");
            } else {
                vestAmount = vestAmounts[i] > 0 ? vestAmounts[i] : defaultVestAmountPerToken;
                require(vestAmount > 0, "Vest amount can't be zero");
            }
            
            vestingInfos[nextTokenId].totalAmount = vestAmount;
             vestingInfos[nextTokenId].unset = unsets[i];

            _safeMint(users[i], nextTokenId);

            nextTokenId ++;
        }
    }

    function setVestAmountForUnset(uint256 _tokenId, uint256 amount) external onlyMinter {
        require(_exists(_tokenId), "Nonexistent token");
        VestingInfo memory vestInfo = vestingInfos[_tokenId];

        require(vestInfo.unset == true, "Already set");
        vestInfo.totalAmount = amount;
        vestInfo.unset = false;
        vestingInfos[_tokenId] = vestInfo;
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

    // Proxy fuctions to the vesting contract

    function vested(uint256 _tokenId) public view returns (uint256) {
        return vesting.vested(_tokenId);
    }

    function locked(uint256 _tokenId) public view returns (uint256) {
        return vesting.locked(_tokenId);
    }

    function withdrawable(uint256 _tokenId) public view returns (uint256) {
        return vesting.withdrawable(_tokenId);
    }

    function withdraw(uint256 _tokenId) external {
        vesting.withdraw(_tokenId);
    }
}
