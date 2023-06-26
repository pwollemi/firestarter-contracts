// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/** 
 * @title Reward NFT collection
 */
contract NFT is Initializable, ERC721EnumerableUpgradeable, ERC721URIStorageUpgradeable, AccessControlEnumerableUpgradeable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // BaseURI for the token metadata
    string private _internalBaseURI;

    /// @notice Lock expire time for a wallet
    mapping(address => uint256) public lockExpiresAt;

    event LockExpiresAt(address indexed wallet, uint256 timestamp);

    /**
     * @dev Initializes the contract by setting a `name`, a `symbol` and a `baseURI` to the token collection.
     */
    function initialize(
        string memory name,
        string memory symbol,
        string memory baseURI
    ) external initializer {
        __ERC721_init(name, symbol);
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
        _internalBaseURI = baseURI;
    }

    modifier onlyAdmin {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ERC721: must have admin role"
        );
        _;
    }

    modifier onlyAdminOrMinter {
        require(
            hasRole(MINTER_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ERC721: must have admin or minter role"
        );
        _;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721EnumerableUpgradeable, AccessControlEnumerableUpgradeable, ERC721Upgradeable)
        returns (bool)
    {
        return
            interfaceId == type(IERC721EnumerableUpgradeable).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev Sets the baseURI for {tokenURI}
     */
    function setBaseURI(string memory newBaseUri) public onlyAdmin {
        _internalBaseURI = newBaseUri;
    }

    /**
     * @dev Sets `_tokenURI` as the tokenURI of `tokenId`.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function setTokenURI(uint256 tokenId, string memory _tokenURI) public onlyAdminOrMinter {
        super._setTokenURI(tokenId, _tokenURI);
    }

    /**
     * @dev Sets `_tokenURI` as the tokenURI of `tokenId`.
     */
    function setBatchTokenURIs(uint256[] memory tokenIds, string[] memory _tokenURIs) public onlyAdminOrMinter {
        require(tokenIds.length == _tokenURIs.length, "ERC721: mismatched ids and URIs");
        for (uint256 i=0; i<tokenIds.length; i=i+1) {
            super._setTokenURI(tokenIds[i], _tokenURIs[i]);
        }
    }

    /**
     * @dev Mints a new token to `to`.
     *
     * `tokenId` of tokens increments from 1.
     *
     */
    function mint(address to, uint256 tokenId) public virtual onlyAdminOrMinter {
        _mint(to, tokenId);
    }

    /**
     * @dev Mints new tokens to `to`.
     */
    function batchMint(address to, uint256[] memory tokenIds) public virtual onlyAdminOrMinter {
        for (uint256 i=0; i<tokenIds.length; i+=1) {
            _mint(to, tokenIds[i]);
        }
    }

    /**
     * @dev Destroys hiro.
     */
    function burn(uint256 tokenId) public virtual {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "ERC721Burnable: caller is not owner nor approved"
        );
        _burn(tokenId);
    }

    /**
     * @dev Transfer multiple tokens.
     */
    function batchTransferFrom(
        address from,
        address to,
        uint256[] memory tokenIds
    ) public virtual {
        for (uint256 i=0; i<tokenIds.length; i+=1) {
            require(_isApprovedOrOwner(_msgSender(), tokenIds[i]), "ERC721: transfer caller is not owner nor approved");

            _transfer(from, to, tokenIds[i]);
        }
    }

    /**
     * @dev Returns the owner of this contract.
     *
     * Admin at index 0 is returned as the owner of this contract. This is for opensea support.
     *
     */
    function owner() public view returns (address) {
        return getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }

    /**
     * @dev See {IERC721Metadata-tokenURI}.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override(ERC721URIStorageUpgradeable, ERC721Upgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721Upgradeable, ERC721EnumerableUpgradeable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function _burn(uint256 tokenId)
        internal
        virtual
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
    {
        super._burn(tokenId);
    }

    function _baseURI() internal view override returns (string memory) {
        return _internalBaseURI;
    }
}
