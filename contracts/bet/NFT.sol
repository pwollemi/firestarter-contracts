// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

/**
 * @title Reward NFT collection
 */
contract NFT is Initializable, ERC1155SupplyUpgradeable, AccessControlEnumerableUpgradeable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Lock expire time for a wallet
    mapping(address => uint256) public lockExpiresAt;

    event LockExpiresAt(address indexed wallet, uint256 timestamp);

    /**
     * @dev Initializes the contract by setting a `name`, a `symbol` and a `baseURI` to the token collection.
     */
    function initialize(string memory baseURI) external initializer {
        __ERC1155_init(baseURI);
        __ERC1155Supply_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "ERC1155: must have admin role");
        _;
    }

    modifier onlyAdminOrMinter() {
        require(
            hasRole(MINTER_ROLE, _msgSender()) || hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ERC1155: must have admin or minter role"
        );
        _;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155Upgradeable, AccessControlEnumerableUpgradeable) returns (bool) {
        return interfaceId == type(IERC1155Upgradeable).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Sets the baseURI for {tokenURI}
     */
    function setBaseURI(string memory newBaseUri) public onlyAdmin {
        _setURI(newBaseUri);
    }

    /**
     * @dev Mints a new token to `to`.
     *
     * `tokenId` of tokens increments from 1.
     *
     */
    function mint(
        address account,
        uint256 id,
        uint256 amount        
    ) public virtual onlyAdminOrMinter {
        _mint(account, id, amount, "");
    }

    /**
     * @dev Destroys hiro.
     */
    function burn(address account, uint256 id, uint256 amount) public virtual {
        require(isApprovedForAll(_msgSender(), account), "caller is not owner nor approved");
        _burn(account, id, amount);
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
}
