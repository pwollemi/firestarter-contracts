// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FlameToken is ERC20, Ownable {
    constructor() ERC20("Flame Token", "FLAME") {
        _mint(msg.sender, 100000000e18);
    }
}
