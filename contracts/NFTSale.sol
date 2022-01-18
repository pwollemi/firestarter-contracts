pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

interface ICollection {
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function mint(address to, uint256 tokenId) external;
}

contract NFTSale is Initializable, OwnableUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /* ============ Structs ============ */

    struct SaleSetting {
        // nft collection
        ICollection collection;
        // fund token
        IERC20Upgradeable fundToken;
        // sale start time
        uint256 startTime;
        // sale end time
        uint256 endTime;
        // nft price in terms of fund token
        uint256 salePrice;
        // global buy limit incase sale is public
        uint256 globalCap;
        // merkle root incase sale is private
        bytes32 merkleRoot;
        // true if it's public sale
        bool isPublic;
    }

    /* ============ State Variables ============ */

    /// @dev sale contract setting
    SaleSetting private saleSetting;

    /// @dev nextTokenId to mint or transfer
    uint256 private nextTokenId;

    /// @dev balance of nft bought
    mapping(address => uint256) private balance;

    /* ============ Admin Functions ============ */

    function initialize(SaleSetting memory _saleSetting) external initializer {
        __Ownable_init();
        __ERC721Holder_init();

        _updateSaleSetting(_saleSetting);
        nextTokenId = 1;
    }

    /**
     * @notice Update the sale setting before it starts
     */
    function updateSaleSetting(SaleSetting memory _saleSetting) external onlyOwner {
        require(saleSetting.startTime > block.timestamp);
        _updateSaleSetting(_saleSetting);
    }

    /**
     * @notice Withdraw the sale tokens after the sale ends
     */
    function withdrawFund() external onlyOwner {
        require(saleSetting.endTime < block.timestamp);
        address owner = owner();
        IERC20Upgradeable fundToken = saleSetting.fundToken;
        fundToken.safeTransfer(owner, fundToken.balanceOf(owner));
    }

    /**
     * @notice Withdraw an unsold nft
     */
    function withdrawNFT(uint256 tokenId) external onlyOwner {
        require(saleSetting.endTime < block.timestamp);
        address owner = owner();
        ICollection collection = saleSetting.collection;
        collection.safeTransferFrom(address(this), owner, tokenId);
    }

    /**
     * @notice Batch withdraw the unsold nft
     */
    function batchWithdrawNFT(uint256[] calldata tokenIds) external onlyOwner {
        require(saleSetting.endTime < block.timestamp);
        address owner = owner();
        ICollection collection = saleSetting.collection;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            collection.safeTransferFrom(address(this), owner, tokenIds[i]);
        }
    }

    /* ============ Public Viewers ============ */

    function getSaleSetting() public view returns (SaleSetting memory) {
        return saleSetting;
    }

    function getBalance(address buyer) public view returns (uint256) {
        return balance[buyer];
    }

    /* ============ User Interacts Functions ============ */

    function buyPublic(uint256 amount) external {
        SaleSetting memory setting = saleSetting;
        require(amount > 0);
        require(setting.startTime <= block.timestamp && setting.endTime >= block.timestamp);
        require(setting.isPublic);
        require(balance[msg.sender] + amount <= setting.globalCap);

        _buy(setting, amount);
    }

    function buyPrivate(
        uint256 amount,
        uint256 alloc,
        bytes32[] calldata proof
    ) external {
        SaleSetting memory setting = saleSetting;
        require(amount > 0);
        require(setting.startTime <= block.timestamp && setting.endTime >= block.timestamp);
        require(!setting.isPublic);
        bytes32 node = keccak256(abi.encode(msg.sender, alloc));
        require(MerkleProofUpgradeable.verify(proof, setting.merkleRoot, node));
        require(balance[msg.sender] + amount <= alloc);

        _buy(setting, amount);
    }

    /* ============ Internal Functions ============ */

    function _buy(SaleSetting memory setting, uint256 amount) private {
        uint256 fundAmount = setting.salePrice * amount;
        setting.fundToken.safeTransferFrom(msg.sender, address(this), fundAmount);
        

        for (uint i = 0; i < amount; i++) {
            try setting.collection.ownerOf(nextTokenId) returns (address origin) {
                require(origin == address(this));
                setting.collection.safeTransferFrom(address(this), msg.sender, nextTokenId);
            } catch (bytes memory) {
                setting.collection.mint(msg.sender, nextTokenId);
            }
            nextTokenId++;
        }
    }

    function _updateSaleSetting(SaleSetting memory _saleSetting) private {
        require(address(_saleSetting.collection) != address(0));
        require(address(_saleSetting.fundToken) != address(0));
        require(_saleSetting.startTime > block.timestamp);
        require(_saleSetting.endTime > _saleSetting.startTime);
        require(_saleSetting.salePrice > 0);
        require(_saleSetting.isPublic || _saleSetting.merkleRoot != 0x0);
        require(!_saleSetting.isPublic || _saleSetting.globalCap > 0);

        saleSetting = _saleSetting;
    }
}
