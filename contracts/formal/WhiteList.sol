pragma experimental ABIEncoderV2;
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "hardhat/console.sol";

contract Whitelist is Context, Ownable {
    using SafeMath for uint256;
    struct UserData {
        address wallet;
        bool isKycPassed;
        uint256 MAX_ALLOC;
    }

    uint256 public totalUsers;
    mapping(address => UserData) public WL; //White List
    event AddedOrRemoved(bool, address, uint256); // 1: Added, 0: Removed

    constructor() {}

    function addToWhitelist(UserData[] memory _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            WL[_users[i].wallet] = _users[i];
            emit AddedOrRemoved(true, _users[i].wallet, block.timestamp);
        }
        totalUsers = totalUsers.add(_users.length);
    }

    function removeFromWhitelist(address[] memory _addrs) external onlyOwner {
        for (uint256 i = 0; i < _addrs.length; i++) {
            // Ignore for non-existing users
            if (WL[_addrs[i]].wallet == address(0x0)) continue;
            delete WL[_addrs[i]];
            emit AddedOrRemoved(false, _addrs[i], block.timestamp);

            totalUsers = totalUsers.sub(1);
        }
    }

    function isUserInWL(address _user) external view returns (bool) {
        return WL[_user].wallet != address(0x0);
    }

    function getUser(address _user)
        external
        view
        returns (
            address,
            bool,
            uint256
        )
    {
        return (WL[_user].wallet, WL[_user].isKycPassed, WL[_user].MAX_ALLOC);
    }
}
