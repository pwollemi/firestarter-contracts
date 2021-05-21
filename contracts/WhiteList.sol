// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract WhiteList is Context, Ownable {
    mapping(address => bool) public whilteList; // True: WhilteListed, False: Not in the whitelist


    constructor(
    ) {

    }

    function addWhiteList(address _user) external onlyOwner {
        require(whilteList[_user] == false, "Already in the whiltelist");
        whilteList[_user] = true;
    }

    function removeWhiteList(address _user) external onlyOwner {
        require(whilteList[_user] == true, "Already not in the whiltelist");
        whilteList[_user] = false;
    }
}
