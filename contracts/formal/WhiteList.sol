// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract WhiteList is Context, Ownable {
    using SafeMath for uint256;

    struct UserData {
        bool isKycPassed;
        uint256 MAX_ALLOC;
    }

    mapping(address => UserData) public WL; //White List
    event AddedOrRemoved(bool, address[], uint256[], uint256); // 1: Added, 0: Removed

    constructor() {}

    function addToWhiteList(
        address[] memory _users,
        uint256[] memory _MAX_ALLOCs
    ) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            address _user = _users[i];
            uint256 _MAX_ALLOC = _MAX_ALLOCs[i];

            whilteList[_user].isKycPassed = true;
            whilteList[_user].MAX_ALLOC = _MAX_ALLOC;
        }

        emit AddedOrRemoved(true, _users, _MAX_ALLOCs, block.timestamp);
    }

    function removeFromWhiteList(address[] memory _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            address _user = _users[i];
            delete whilteList[_user];
        }
        emit AddedOrRemoved(false, _users, [], block.timestamp);
    }
}
