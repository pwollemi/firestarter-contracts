// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./TokenVesting.sol";

contract DevFundVesting is TokenVesting {
    uint256 public constant TOTAL_AMOUNT = 10000000e18;
    uint256 public constant WITHDRAW_INTERVAL = 730 days;
    uint256 public constant INITIAL_UNLOCK = 0;
    uint256 public constant RELEASE_RATE = 100;

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
