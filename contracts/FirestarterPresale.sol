// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;
pragma abicoder v2;

import "./interfaces/IVesting.sol";
import "./Presale.sol";

/// @title Firestarter Presale Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for presale of projects
/// @dev All function calls are currently implemented without side effects
contract FirestarterPresale is Presale {
    /**
     * @notice Deposit reward token when private sale
     * @dev Only owner can do this operation
     * @param user address of the participant
     * @param amount amount of reward token
     */
    function depositPrivateSale(address user, uint256 amount) external whileDeposited onlyOwner {
        require(isPrivateSaleOver == false, "depositPrivateSale: Private Sale is ended!");

        uint256 ftAmount = (amount * (10**IERC20Extended(fundToken).decimals()) * exchangeRate) /
            ACCURACY /
            (10**IERC20Extended(rewardToken).decimals());

        Recipient storage recp = recipients[user];
        recp.rtBalance = recp.rtBalance + amount;
        recp.ftBalance = recp.ftBalance + ftAmount;
        privateSoldAmount = privateSoldAmount + amount;
        privateSoldFunds[user] = privateSoldFunds[user] + ftAmount;

        if (inserted[user] == false) {
            inserted[user] = true;
            indexOf[user] = participants.length;
            participants.push(user);
        }

        IVesting(vesting).updateRecipient(user, recp.rtBalance);

        emit Vested(user, recp.rtBalance, true, block.timestamp);
    }
}
