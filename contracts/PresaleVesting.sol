// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./TokenVesting.sol";

contract PresaleVesting is TokenVesting {
    uint256 public constant TOTAL_AMOUNT = 20000000e18;
    uint256 public constant WITHDRAW_INTERVAL = 30 days;
    uint256 public constant INITIAL_UNLOCK = 15;
    uint256 public constant RELEASE_RATE = 15;

    constructor(address _token)
        TokenVesting(
            _token,
            TOTAL_AMOUNT,
            INITIAL_UNLOCK,
            WITHDRAW_INTERVAL,
            RELEASE_RATE
        )
    {}
}
