// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWhiteList.sol";

contract Presale is Context, Ownable {
    using SafeMath for uint256;

    uint256 public startTime;
    bool public isStartTimeSet;
    uint256 public withdrawInterval; // Amount of time in seconds between withdrawal periods.
    uint256 public releaseRate; // Release percent in each withdrawing interval

    uint256 public totalAmount; // Total amount of tokens to be vested.
    uint256 public unallocatedAmount; // The amount of tokens that are not allocated yet.
    uint256 public initialUnlock; // Percent of tokens initially unlocked

    // *****
    bool public enabled = false;

    struct Recipient {
        uint256 amountDepositedFT;
        uint256 amountRF;
    }

    IERC20 public FT; // Funds Token : Token for funderside. (Maybe it will be the stable coin)
    IERC20 public RT; // Rewards Token : Token for distribution as rewards.
    IWhiteList public CW; // WhiteList Contract : For checking if the user has passed the KYC
    IVesting public CV; // Vesting Contract

    uint256 public goalFunds; // Funds amount to be raised. Amount * FT's Decimals
    uint256 public ER; // Exchange Rate : Fixed Rate between FT vs rewardsToken = rewards/funds * 1e6
    uint256 public PP: // Presale Period
    uint256 public PT: // Presale Start Time
    mapping(address => Recipient) public recipients;

    event Deposit(address indexed, uint256, uint256, uint256);

    constructor(
        address _CW,
        address _CV,
        address _FT,
        address _RT,
        uint256 _goalFunds,
        uint256 _ER,
        uint256 _PT,
        uint256 _PP,
    ) {
        CW = IWhiteList(_CW);
        CV = IVesting(_CV);
        FT = IERC20(_FT);
        RT = IERC20(_RT);
        goalFunds = _goalFunds;
        ER = _ER;
        PT = _PT;
        PP = _PP;
    }

    modifier whileEnabled() {
        require(block.timestamp >= PP, "Presale has been started yet");
        require(enabled == true, "Presale has been ended or paused");
        _;
    }

    function updateCV(address _CV) external onlyOwner {
        CW = IWhiteList(_CV);
    }

    function updateCW(address _CW) external onlyOwner {
        CW = IWhiteList(_CW);
    }

    function updateER(uint256 _ER) external onlyOwner {
        require(_ER > 0, "UpdateER: Exchnage Rate couldn't be ZERO!");
        ER = _ER;
    }

    function startPresale() external onlyOwner {
        enabled = true;
    }

    function pausePresaleForEmbergency() external onlyOwner {
        enabled = false;
    }
    /**
    @note Users will call this deposit function for deposit the FT
    */
    function deposit(uint256 amount) external whileEnabled{
        uint256 newAmountDepositedFT =
            recipients[msg.sender].amountDepositedFT.add(amount);

        require(
            CW.WL(msg.sender).isKycDone == true,
            "Deposit: Pass the KCY first please!"
        );
        require(
            CW.WL(msg.sender).MAX_ALLOC >= newAmountDepositedFT,
            "Deposit: Can't exceed the MAX_ALLOC!"
        );
        require(
            FT.balanceOf(msg.sender) >= amount,
            "Deposit: Insufficient balance on the user wallet!"
        );
        require(
            FT.transferFrom(msg.sender, address(this), amount),
            "Deposit: Transaction has been failed!"
        );

        recipients[msg.sender].amountDepositedFT = newAmountDepositedFT;
        recipients[msg.sender].amountRF = recipients[msg.sender].amountRF.add(
            (amount.mul(_exchangeRate).div(1e6))
        );
        emit Deposit(msg.sender, amount, newAmountDepositedFT, block.timestamp);
    }
}
