// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "./TokenVesting.sol";

contract SeedVesting is TokenVesting {
    uint256 public constant TOTAL_AMOUNT = 5000000e18;
    uint256 public constant WITHDRAW_INTERVAL = 30 days;
    uint256 public constant INITIAL_UNLOCK = 5;
    uint256 public constant RELEASE_RATE = 10;

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
