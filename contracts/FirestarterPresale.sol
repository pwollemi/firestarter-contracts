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

    constructor(
        AddressParams memory _addrs,
        PresaleParams memory _presale,
        address[] memory owners
    ) Presale(_addrs, _presale, owners) {}

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

        privateSoldAmount = privateSoldAmount.add(amount);

        Recipient storage recp = recipients[user];
        recp.rtBalance = recp.rtBalance.add(amount);
        IVesting(vesting).updateRecipient(user, recp.rtBalance);

        emit Vested(user, recp.rtBalance, block.timestamp);
    }
}
