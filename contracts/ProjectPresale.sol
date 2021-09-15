// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWhitelist.sol";
import "./interfaces/IVesting.sol";
import "./Presale.sol";

/// @title Firestarter Presale Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for presale of projects
/// @dev All function calls are currently implemented without side effects
contract ProjectPresale is Presale {
    using SafeMath for uint256;

    /**
     * @notice Deposit fund token to the pool in private presale
     * @dev Only allowed users can do this operation.
     * @param amount amount of fund token
     */
    function depositPrivateSale(uint256 amount)
        external
        whileDeposited
    {
        require(
            isPrivateSaleOver == false,
            "depositPrivateSale: Private Sale is ended!"
        );

        // check if user is in white list
        (address user, bool isKycPassed, , bool allowedPrivateSale, uint256 privateMaxAlloc) = IWhitelist(whitelist).getUser(
            msg.sender
        );
        require(user != address(0), "depositPrivateSale: Not exist on the whitelist");
        require(isKycPassed, "depositPrivateSale: Not passed KYC");
        require(allowedPrivateSale == true, "depositPrivateSale: Not allowed to participate in private sale");

        // calculate fund token balance after deposit
        Recipient storage recp = recipients[msg.sender];
        uint256 newFundBalance = recp.ftBalance.add(amount);
        require(
            privateMaxAlloc >= newFundBalance,
            "Deposit: Can't exceed the privateMaxAlloc!"
        );
        require(
            IERC20(fundToken).transferFrom(msg.sender, address(this), amount),
            "Deposit: Can't transfer fund token!"
        );

        uint256 rtAmount = amount
        .mul(10**IERC20(rewardToken).decimals())
        .mul(accuracy)
        .div(exchangeRate)
        .div(10**IERC20(fundToken).decimals());        

        recp.ftBalance = newFundBalance;
        recp.rtBalance = recp.rtBalance.add(rtAmount);
        privateSoldAmount = privateSoldAmount.add(rtAmount);
        privateSoldFunds[user] = privateSoldFunds[user].add(amount);

        if (inserted[user] == false) {
            inserted[user] = true;
            indexOf[user] = participants.length;
            participants.push(user);
        }

        IVesting(vesting).updateRecipient(msg.sender, recp.rtBalance);

        emit Vested(msg.sender, recp.rtBalance, true, block.timestamp);
    }
}
