// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IMerkleWhitelist {
    struct UserData {
        // User wallet address
        address wallet;
        // Flag for KYC status
        bool isKycPassed;
        // Max allocation for this user in public presale
        uint256 publicMaxAlloc;
        // Flag if this user is allowed to participate in private presale
        bool allowedPrivateSale;
        // Max allocation for this user in private presale
        uint256 privateMaxAlloc;
    }

    function setMerkleRoot(bytes32 _root) external;

    function verify(UserData memory userInfo, bytes32[] calldata merkleProof) external view returns (bool);
}
