// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "./LockingTokenVesting.sol";

contract TeamVesting is LockingTokenVesting {
    uint256 public constant TOTAL_AMOUNT = 10000000e18;
    uint256 public constant WITHDRAW_INTERVAL = 365 days;
    uint256 public constant INITIAL_UNLOCK = 0;
    uint256 public constant RELEASE_RATE = 100;
    uint256 public constant LOCK_PERIODS = 180 days;

    constructor(address _token)
        LockingTokenVesting(
            _token,
            TOTAL_AMOUNT,
            INITIAL_UNLOCK,
            WITHDRAW_INTERVAL,
            RELEASE_RATE,
            LOCK_PERIODS
        )
    {}
}
