// SPDX-License-Identifier: MIT
// Only for testing
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract FT is ERC20PresetMinterPauser("Funds Token", "FT") {}
