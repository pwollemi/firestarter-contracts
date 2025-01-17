// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./interfaces/IWhitelist.sol";
import "./interfaces/IVesting.sol";
import "./Presale.sol";

/// @title Firestarter Presale Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for presale of projects
/// @dev All function calls are currently implemented without side effects
contract ProjectPresaleV2 is Presale {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Presale Start Time
    uint256 public privateSaleStartTime;

    /// @notice An event emitted when privateSaleStartTime is set
    event PrivateSaleStartTimeSet(uint256 startTime);

    /**
     * @notice Set presale start time
     * @dev This should be called before presale starts
     * @param newStartTime New start time
     */
    function setPrivateSaleStartTime(uint256 newStartTime) external onlyOwner {
        require(
            privateSaleStartTime > block.timestamp || privateSaleStartTime == 0,
            "setPrivateSaleStartTime: Private Presale already started"
        );
        require(newStartTime > block.timestamp, "setPrivateSaleStartTime: Should be time in future");

        privateSaleStartTime = newStartTime;

        emit PrivateSaleStartTimeSet(newStartTime);
    }

    /**
     * @notice Deposit fund token to the pool in private presale
     * @dev Only allowed users can do this operation.
     * @param amount        amount of fund token
     * @param alloInfo      whitelist info of the user
     * @param merkleProof   proof array
     */
    function depositPrivateSale(uint256 amount, IMerkleWhitelist.UserData memory alloInfo, bytes32[] memory merkleProof) external whileDeposited {
        require(block.timestamp >= privateSaleStartTime, "depositPrivateSale: Private Sale is not started");
        require(isPrivateSaleOver == false, "depositPrivateSale: Private Sale is ended!");

        // check if user is in white list
        require(msg.sender == alloInfo.wallet, "depositPrivateSale: Invalid alloInfo");
        require(IMerkleWhitelist(whitelist).verify(alloInfo, merkleProof), "depositPrivateSale: Not exist on the whitelist");
        require(alloInfo.isKycPassed, "depositPrivateSale: Not passed KYC");
        require(
            alloInfo.allowedPrivateSale == true,
            "depositPrivateSale: Not allowed to participate in private sale"
        );

        // calculate fund token balance after deposit
        Recipient storage recp = recipients[msg.sender];
        uint256 newFundBalance = recp.ftBalance + amount;
        require(alloInfo.privateMaxAlloc >= newFundBalance, "Deposit: Can't exceed the privateMaxAlloc!");
        IERC20Upgradeable(fundToken).safeTransferFrom(msg.sender, address(this), amount);

        uint256 rtAmount = (amount * (10**IERC20Extended(rewardToken).decimals()) * ACCURACY) /
            exchangeRate /
            (10**IERC20Extended(fundToken).decimals());

        recp.ftBalance = newFundBalance;
        recp.rtBalance = recp.rtBalance + rtAmount;
        privateSoldAmount = privateSoldAmount + rtAmount;
        privateSoldFunds[msg.sender] = privateSoldFunds[msg.sender] + amount;

        if (inserted[msg.sender] == false) {
            inserted[msg.sender] = true;
            indexOf[msg.sender] = participants.length;
            participants.push(msg.sender);
        }

        IVesting(vesting).updateRecipient(msg.sender, recp.rtBalance);

        emit Vested(msg.sender, recp.rtBalance, true, block.timestamp);
    }
}
