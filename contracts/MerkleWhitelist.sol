// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

contract MerkleWhitelist is Initializable, OwnableUpgradeable {
    /// @notice The merkle root of the the merkle tree
    bytes32 public root;

    /// @notice The worker is allowed to set/modiify the merkle root
    address public worker;

    /**
     * @dev Throws if called by any account other than the owner or the worker.
     */
    modifier onlyOwnerOrWorker() {
        require(owner() == _msgSender() || worker == _msgSender(), "Whitelist: caller is not the owner nor the worker");
        _;
    }

    
    function initialize() external initializer {
        __Ownable_init();
    }

    /**
     * @notice Set the worker address
     * @param _worker address
     */
    function setWorker(address _worker) external onlyOwner {
        worker = _worker;
    }

    /**
     * @notice Set the merkle root
     * @param _root bytes32
     */
    function setMerkleRoot(bytes32 _root) external onlyOwnerOrWorker {
        root = _root;
    }

    /**
     * @notice Verify the user infos
     * @param wallet        The account address
     * @param isKycPassed   True if the account is passed KYC 
     * @param amount        The amount of nfts that the account can buy
     * @param merkleProof   The merkle proof
     * @return True if verified
     */
    function verify(address wallet, bool isKycPassed, uint256 amount, bytes32[] calldata merkleProof) public view returns (bool) {
        bytes32 node = keccak256(abi.encode(wallet, isKycPassed, amount));
        return MerkleProofUpgradeable.verify(merkleProof, root, node);
    }
}