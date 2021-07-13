// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "../interfaces/IWhiteList.sol";
import "./Vesting.sol";

contract Presale is Context, AccessControlEnumerable {
    using SafeMath for uint256;

    bool private isPresaleStarted = false;
    bool private isPrivateSaleOver = false;
    uint256 public totalSoldRTAmount;

    struct Recipient {
        uint256 amountDepositedFT; // Funds token amount per recipient.
        uint256 amountRF; // Rewards token that needs to be vested.
    }
    mapping(address => Recipient) public recipients;

    IERC20 public FT; // Funds Token : Token for funderside. (Maybe it will be the stable coin)
    IERC20 public RT; // Rewards Token : Token for distribution as rewards.
    IWhitelist public CW; // WhiteList Contract : For checking if the user has passed the KYC
    Vesting public CV; // Vesting Contract

    address public PO; // Project Owner : The address where to withdraw funds token to after presale
    uint256 public goalFunds; // Funds amount to be raised. Amount * FT's Decimals
    uint256 public ER; // Exchange Rate : Fixed Rate between FT vs rewardsToken = rewards/funds * 1e6
    uint256 public PP; // Presale Period
    uint256 public PT; // Presale Start Time
    uint256 public SF = 50000; // Service Fee : eg 1e4 = 1% default is 5%
    uint256 public IDR; // Initial Deposited RT amount

    /********************** Events ***********************/
    event PrivateSaleDone(string, uint256);
    event Vested(address indexed, uint256, uint256);
    event WithdrawUnsoldRT(address indexed, uint256, uint256);
    event WithdrawFunds(address indexed, uint256, uint256);
    event PreSaleStarted(string, uint256);
    event PreSalePaused(string, uint256);

    /********************** Modifiers ***********************/
    modifier onlyOwner() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "Requires Owner Role"
        );
        _;
    }

    modifier whileOnGoing() {
        require(block.timestamp >= PT, "Presale has been started yet");
        require(block.timestamp <= PT + PP, "Presale has been ended");
        require(isPresaleStarted == true, "Presale has been ended or paused");
        _;
    }

    modifier whileFinished() {
        require(block.timestamp > PT + PP, "Presale has not been ended yet!");
        _;
    }

    modifier whileDeposited() {
        require(
            getDepositiedRT() >= IDR,
            "Deposit enough RT tokens to the vesting contract first!"
        );
        _;
    }

    constructor(
        address[4] memory _addrs, // CW, FT, RT, PO
        uint256[10] memory _vals, // goalFunds : 0, ER : 1, PT : 2, PP : 3, SF : 4, IU : 5, WI : 6, RR : 7, LP : 8, IDR : 9
        address _owner
    ) {
        // _msgSender() will be factory contract in near future
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);

        CW = IWhitelist(_addrs[0]);
        FT = IERC20(_addrs[1]);
        RT = IERC20(_addrs[2]);
        PO = _addrs[3];

        goalFunds = _vals[0];

        ER = _vals[1];
        PT = _vals[2];
        PP = _vals[3];
        SF = _vals[4];

        // For vesting contract
        // IU : Initual Unlock
        // WI : Withdraw Interval
        // RR : Release Rate
        // LP : LockPeriod
        CV = new Vesting(_addrs[2], _vals[5], _vals[6], _vals[7], _vals[8]);

        IDR = _vals[9];
    }

    /********************** Setter ***********************/
    function updateCW(address _CW) external onlyOwner {
        CW = IWhitelist(_CW);
    }

    function updateER(uint256 _ER) external onlyOwner {
        require(_ER > 0, "updateER: Exchnage Rate can't be ZERO!");
        ER = _ER;
    }

    function updatePP(uint256 _PP) external onlyOwner {
        require(_PP > 0, "updatePP: Presale Period can't be ZERO!");
        PP = _PP;
    }

    function updatePO(address _PO) external onlyOwner {
        require(
            _PO != address(0x00),
            "updatePO: Project Owner address can't be 0x00!"
        );
        PO = _PO;
    }

    /********************** Internal ***********************/
    /// Get the RT token amount of vesting contract
    function getDepositiedRT() internal view returns (uint256) {
        address addrVesting = address(CV);
        return RT.balanceOf(addrVesting);
    }

    /********************** External ***********************/
    function isPresaleGoing() external view returns (bool) {
        return block.timestamp > PT + PP;
    }

    /// startPresale by checking the pre-requirements.
    function startPresale() external whileDeposited onlyOwner {
        require(
            isPrivateSaleOver == true,
            "startPresale: Private Sale has not been done yet!"
        );

        require(
            isPresaleStarted == false,
            "startPresale: Presale has been already started!"
        );

        require(
            getDepositiedRT() != 0,
            "startPresale: Please deposit RT tokens to vesting contract first!"
        );

        isPresaleStarted = true;
        // TODO: Are we updating the initial PT?
        PT = block.timestamp;
        emit PreSaleStarted("Presale has been started", block.timestamp);
    }

    /// Pause the ongoing presale by mergency
    function pausePresaleByEmergency() external onlyOwner {
        isPresaleStarted = false;
    }

    /// After presale ends, we withdraw funds to project owner by charging a service fee
    function withdrawFunds(address treasury) external whileFinished onlyOwner {
        require(
            PO != address(0x00),
            "withdraw: Project Owner address hasn't been set!"
        );
        require(treasury != address(0x00), "withdraw: Treasury can't be 0x00");

        uint256 balance = FT.balanceOf(address(this));
        uint256 serviceFee = balance.mul(SF).div(1e6);
        uint256 actualFunds = balance.sub(serviceFee);

        require(FT.transfer(PO, actualFunds), "withdraw: can't withdraw funds");
        require(
            FT.transfer(treasury, serviceFee),
            "withdraw: can't withdraw service fee"
        );

        emit WithdrawFunds(PO, actualFunds, block.timestamp);
        emit WithdrawFunds(treasury, serviceFee, block.timestamp);
    }

    /// After presale ends, we withdraw unsold RT token to project owner.
    function withdrawUnsoldRT() external whileFinished onlyOwner {
        require(
            PO != address(0x00),
            "withdraw: Project Owner address hasn't been set!"
        );

        uint256 totalDepositedRT = getDepositiedRT();
        uint256 unsoldRT = totalDepositedRT.sub(totalSoldRTAmount);

        require(
            RT.transferFrom(address(CV), PO, unsoldRT),
            "withdraw: can't withdraw funds"
        );

        emit WithdrawUnsoldRT(PO, unsoldRT, block.timestamp);
    }

    /// Receive funds token from the participants with checking the requirements.
    function deposit(uint256 amount) external whileOnGoing {
        uint256 newAmountDepositedFT =
            recipients[_msgSender()].amountDepositedFT.add(amount);

        (, bool isKycPassed, uint256 MAX_ALLOC) = CW.getUser(_msgSender());
        require(
            CW.isUserInWL(_msgSender()),
            "Deposit: Not exist on the whitelist"
        );
        require(
            MAX_ALLOC >= newAmountDepositedFT,
            "Deposit: Can't exceed the MAX_ALLOC!"
        );
        require(
            FT.balanceOf(_msgSender()) >= amount,
            "Deposit: Insufficient balance on the user wallet!"
        );
        require(
            FT.transferFrom(_msgSender(), address(this), amount),
            "Deposit: Transaction has been failed!"
        );

        uint256 newRTAmount = amount.mul(ER).div(1e6);

        recipients[_msgSender()].amountDepositedFT = newAmountDepositedFT;
        totalSoldRTAmount = totalSoldRTAmount.add(newRTAmount);

        recipients[_msgSender()].amountRF = recipients[_msgSender()]
            .amountRF
            .add(newRTAmount);

        CV.updateRecipient(_msgSender(), recipients[_msgSender()].amountRF);

        emit Vested(
            _msgSender(),
            recipients[_msgSender()].amountRF,
            block.timestamp
        );
    }

    function endPrivateSale() external onlyOwner {
        isPrivateSaleOver = true;
        emit PrivateSaleDone("Private Sale is over", block.timestamp);
    }

    function addOrUpdateInfulencer(address _influencer, uint256 _amount)
        external
        whileDeposited
        onlyOwner
    {
        CV.updateRecipient(_influencer, _amount);

        emit Vested(_influencer, _amount, block.timestamp);
    }
}
