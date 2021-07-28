// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IVesting.sol";
import "./Presale.sol";

/// @title Firestarter Presale Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for presale of projects
/// @dev All function calls are currently implemented without side effects
contract FirestarterPresale is Presale {
    using SafeMath for uint256;

    /**
     * @notice Deposit reward token when private sale
     * @dev Only owner can do this operation
     * @param user address of the participant
     * @param amount amount of reward token
     */
    function depositPrivateSale(address user, uint256 amount)
        external
        whileDeposited
        onlyOwner
    {
        require(
            isPrivateSaleOver == false,
            "depositPrivateSale: Private Sale is ended!"
        );

        uint256 ftAmount = amount
        .mul(10**IERC20(fundToken).decimals())
        .mul(exchangeRate)
        .div(accuracy)
        .div(10**IERC20(rewardToken).decimals());

        Recipient storage recp = recipients[user];

        if (recp.rtBalance == 0 && amount > 0) {
            indexOf[user] = participants.length;
            participants.push(user);
        }

        recp.rtBalance = recp.rtBalance.add(amount);
        recp.ftBalance = recp.ftBalance.add(ftAmount);
        privateSoldAmount = privateSoldAmount.add(amount);
        privateSoldFunds[user] = privateSoldFunds[user].add(ftAmount);

        IVesting(vesting).updateRecipient(user, recp.rtBalance);

        emit Vested(user, recp.rtBalance, true, block.timestamp);
    }
}
