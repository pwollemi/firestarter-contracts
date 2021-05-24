// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract WhiteList is Context, Ownable {
    using SafeMath for uint256;

    struct UserData {
        bool isKycDone;
        uint256 allocation;
    }

    uint256 public totalAllocation;
    mapping(address => UserData) public whiteList;
    event AddedOrRemoved(address indexed, bool, uint256, uint256); // 1: Added, 0: Removed

    constructor() {}

    function addToWhiteList(address _user, uint256 _allocation)
        external
        onlyOwner
    {
        require(
            whilteList[_user].isKycDone == false,
            "Already in the whiltelist!"
        );
        require(_allocation > 0, "Allocation couldn't be ZERO!");
        whilteList[_user].isKycDone = true;
        whilteList[_user].allocation = _allocation;
        totalAllocation = totalAllocation.add(_allocation);
        emit AddedOrRemoved(_user, true, totalAllocation, block.timestamp);
    }

    function updateUserAllocation(address _user, uint256 _allocation)
        external
        onlyOwner
    {
        require(
            whilteList[_user].isKycDone == true,
            "User should complete the KYC first!"
        );
        totalAllocation = totalAllocation.sub(whilteList[_user].allocation);
        whilteList[_user].allocation = _allocation;
        totalAllocation = totalAllocation.add(_allocation);
        emit AddedOrRemoved(_user, true, totalAllocation, block.timestamp);
    }

    function removeFromWhiteList(address _user) external onlyOwner {
        require(whilteList[_user].isKycDone == true, "User is not exist!");
        delete whilteList[user];
        totalAllocation = totalAllocation.sub(whilteList[_user].allocation);
        emit AddedOrRemoved(_user, false, totalAllocation, block.timestamp);
    }
}
