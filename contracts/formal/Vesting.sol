// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWhiteList.sol";

contract Vesting is Context, Ownable {
    using SafeMath for uint256;

    struct VestingSchedule {
        uint256 totalAmount; // Total amount of tokens to be vested.
        uint256 amountWithdrawn; // The amount that has been withdrawn.
    }

    mapping(address => VestingSchedule) public recipients;

    uint256 public startTime;
    bool public isStartTimeSet;
    uint256 public withdrawInterval; // Amount of time in seconds between withdrawal periods.
    uint256 public releaseRate; // Release percent in each withdrawing interval

    uint256 public totalAmount; // Total amount of tokens to be vested.
    uint256 public unallocatedAmount; // The amount of tokens that are not allocated yet.
    uint256 public initialUnlock; // Percent of tokens initially unlocked

    // *****
    IERC20 public fundsToken; // Token that will be used to contribute for funds
    IERC20 public rewardToken; // Token for distributing. (Maybe it will be the stable coin)
    IWhiteList public whiteListContract; // For checking if the user has done the KYC

    uint256 public totalFunds; // Funds amount to be raised. Amount * FundsToken's Decimals
    uint256 public totalRewards; // Rewards amount to be distributed. Amount * RewardsToken's Decimals

    uint256 public exchangeRate; // Fixed Rate between fundsToken vs rewardsToken = rewards/funds * 1e6
    mapping(address => uint256) public rewardsAmount; // userAddres => amount of RewardsToken

    event Deposit(address indexed, uint256, uint256);

    constructor(
        address _rewardsToken,
        address _fundsToken,
        address _whiteList,
        uint256 _totalFunds,
        uint256 _totalRewards,
        uint256 _exchangeRate
    ) {
        rewardToken = IERC20(_rewardsToken);
        fundsToken = IERC20(_fundsToken);
        whiteListContract = IWhiteList(_whiteList);
        totalFunds = _totalFunds;
        totalRewards = _totalRewards;
        exchangeRate = _exchangeRate;
        isStartTimeSet = false;
    }

    function updateWhiteListContract(address _whiteList) external onlyOwner {
        IWhiteList = IWhiteList(_whiteList);
    }

    function updateExchangeRate(uint256 _exchangeRate) external onlyOwner {
        exchangeRate = _exchangeRate;
    }

    /**
    @note Users will call this deposit function for deposit the fundsToken
    */
    function deposit(uint256 amount) external {
        require(
            whiteListContract.whiteList(msg.sender).isKycDone == true,
            "Deposit: KCY first please"
        );
        require(
            fundsToken.balanceOf(msg.sender) >= amount,
            "Deposit: Insufficient balance on the user wallet"
        );
        require(
            fundsToken.transferFrom(msg.sender, address(this), amount),
            "Deposit: Transaction has been failed"
        );

        rewardsAmount[msg.sender] = (amount.mul(_exchangeRate).div(1e6));
        emit Deposit(msg.sender, amount, block.timestamp);
    }
}
