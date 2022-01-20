// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

import "./interfaces/IMerkleWhitelist.sol";

contract MerkleWhitelist is IMerkleWhitelist, Initializable, OwnableUpgradeable {
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
    function setMerkleRoot(bytes32 _root) external override onlyOwnerOrWorker {
        root = _root;
    }

    /**
     * @notice Verify the user infos
     * @param userInfo      The whitelist info of the user
     * @param merkleProof   The merkle proof
     * @return True if verified
     */
    function verify(UserData memory userInfo, bytes32[] memory merkleProof) public override view returns (bool) {
        bytes32 node = keccak256(abi.encode(userInfo.wallet, userInfo.isKycPassed, userInfo.publicMaxAlloc, userInfo.allowedPrivateSale, userInfo.privateMaxAlloc));
        return MerkleProofUpgradeable.verify(merkleProof, root, node);
    }
}