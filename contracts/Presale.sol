// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./libraries/AddressPagination.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWhitelist.sol";
import "./interfaces/IVesting.sol";

/// @title Firestarter Presale Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for presale of projects
/// @dev All function calls are currently implemented without side effects
contract Presale is Initializable, AccessControlEnumerableUpgradeable {
    using SafeMath for uint256;
    using AddressPagination for address[];

    struct Recipient {
        // Deposited Funds token amount of the recipient
        uint256 ftBalance;
        // Rewards Token amount that needs to be vested
        uint256 rtBalance;
    }

    struct AddressParams {
        // Fund token
        address fundToken;
        // Reward token(from the project)
        address rewardToken;
        // Owner of this project
        address projectOwner;
        // Contract that managers WL users
        address whitelist;
        // Presale Vesting Contract
        address vesting;
    }

    struct PresaleParams {
        // Exchange rate between the Fund token and Reward token
        uint256 rate;
        // Timestamp when presale starts
        uint256 startTime;
        // Presale period
        uint256 period;
        // Service Fee : eg 1e5 = 10% default is 5%
        uint256 serviceFee;
        // Funds amount to be raised. Amount * fundToken's Decimals
        uint256 goalFunds;
        // Initial Deposited rewardToken amount
        uint256 initialRewardsAmount;
    }

    /// @notice General decimal values accuracy unless specified differently (e.g. fees, exchange rates)
    uint256 public constant accuracy = 1e10;

    /********************** Address Infos ***********************/

    /// @notice Token for funderside. (Maybe it will be the stable coin)
    address public fundToken;

    /// @notice Token for distribution as rewards.
    address public rewardToken;

    /// @notice Project Owner: The address where to withdraw funds token to after presale
    address public projectOwner;

    /// @dev WhiteList Contract: For checking if the user has passed the KYC
    address internal whitelist;

    /// @notice Vesting Contract
    address public vesting;

    /// @notice Goal Funds : Funds amount to be raised. Amount * fundToken's Decimals
    // uint256 public goalFunds;

    /********************** Presale Params ***********************/

    /// @notice Fixed Rate between fundToken vs rewardsToken = rewards/funds * accuracy
    uint256 public exchangeRate;

    /// @notice Presale Period
    uint256 public presalePeriod;

    /// @notice Presale Start Time
    uint256 public startTime;

    /// @notice Service Fee: eg 1e5 = 10% default is 5%
    uint256 public serviceFee;

    /// @notice Initial Deposited rewardToken amount
    uint256 public initialRewardAmount;

    /********************** Status Infos ***********************/

    /// @dev Private sale status
    bool public isPrivateSaleOver;

    /// @notice Presale pause status
    bool public isPresalePaused;

    /// @notice Presale remaining time if paused
    uint256 public currentPresalePeriod;

    /// @dev Reward token amount sold by Private Sale
    uint256 public privateSoldAmount;

    /// @notice Reward token amount sold by Public Sale
    uint256 public publicSoldAmount;

    /// @notice Record of fund token amount sold in Private Presale;
    mapping(address => uint256) public privateSoldFunds;

    /// @notice Participants information
    mapping(address => Recipient) public recipients;

    // Participants list
    address[] internal participants;
    mapping(address => uint256) internal indexOf;
    mapping(address => bool) internal inserted;

    /// @notice An event emitted when the private sale is done
    event PrivateSaleDone(uint256);

    /// @notice An event emitted when presale is started
    event PresaleManuallyStarted(uint256);

    /// @notice An event emitted when presale is paused
    event PresalePaused(uint256);

    /// @notice An event emitted when presale is started
    event PresaleResumed(uint256);

    /// @notice An event emitted when a user vested reward token
    event Vested(address indexed user, uint256 amount, bool isPrivate, uint256 timestamp);

    /// @notice An event emitted when the remaining reward token is withdrawn
    event WithdrawUnsoldToken(
        address indexed receiver,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice An event emitted when funded token is withdrawn(project owner and service fee)
    event WithdrawFunds(
        address indexed receiver,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice An event emitted when startTime is set
    event StartTimeSet(uint256 startTime);

    modifier onlyOwner() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Requires Owner Role");
        _;
    }

    modifier whileOnGoing() {
        require(isPresaleGoing(), "Presale is not in progress");
        _;
    }

    modifier whilePaused() {
        require(isPresalePaused, "Presale is not paused");
        _;
    }

    modifier whileFinished() {
        require(
            block.timestamp > startTime + currentPresalePeriod,
            "Presale has not been ended yet!"
        );
        _;
    }

    modifier whileDeposited() {
        require(
            _getDepositedRewardTokenAmount() >= initialRewardAmount,
            "Deposit enough rewardToken tokens to the vesting contract first!"
        );
        _;
    }

    function initialize(
        AddressParams memory _addrs,
        PresaleParams memory _presale,
        address[] memory owners
    ) external initializer {
        __AccessControlEnumerable_init();

        // msg.sender will be factory contract
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Grant admin role to owners
        for (uint256 i = 0; i < owners.length; i++) {
            _setupRole(DEFAULT_ADMIN_ROLE, owners[i]);
        }

        fundToken = _addrs.fundToken;
        rewardToken = _addrs.rewardToken;
        projectOwner = _addrs.projectOwner;
        whitelist = _addrs.whitelist;
        vesting = _addrs.vesting;

        exchangeRate = _presale.rate;
        startTime = _presale.startTime;
        presalePeriod = _presale.period;
        serviceFee = _presale.serviceFee;
        // goalFunds = _presale.goalFunds;
        initialRewardAmount = _presale.initialRewardsAmount;

        currentPresalePeriod = presalePeriod;
    }

    /**
     * @notice Return the number of participants
     */
    function participantsLength() external view returns (uint256) {
        return participants.length;
    }

    /**
     * @notice Return the list of participants
     */
    function getParticipants(uint256 page, uint256 limit) external view returns (address[] memory) {
        return participants.paginate(page, limit);
    }

    /**
     * @notice Finish Private Sale
     * @dev Only owner can end private sale
     */
    function endPrivateSale() external onlyOwner {
        isPrivateSaleOver = true;
        emit PrivateSaleDone(block.timestamp);
    }

    /**
     * @notice Set presale start time
     * @dev This should be called before presale starts
     * @param newStartTime New start time
     */
    function setStartTime(uint256 newStartTime) external onlyOwner {
        require(
            startTime >= block.timestamp,
            "setStartTime: Presale already started"
        );
        require(
            newStartTime > block.timestamp,
            "setStartTime: Should be time in future"
        );

        isPrivateSaleOver = true;
        startTime = newStartTime;

        emit StartTimeSet(newStartTime);
    }

    /**
     * @notice Start presale
     * @dev Need to check if requirements are satisfied
     */
    function startPresale() external whileDeposited onlyOwner {
        require(
            isPrivateSaleOver == true,
            "startPresale: Private Sale has not been done yet!"
        );

        require(
            startTime > block.timestamp,
            "startPresale: Presale has been already started!"
        );

        require(
            _getDepositedRewardTokenAmount() != 0,
            "startPresale: Please deposit rewardToken tokens to vesting contract first!"
        );

        startTime = block.timestamp;

        emit PresaleManuallyStarted(block.timestamp);
    }

    /**
     * @notice Pause the ongoing presale by mergency
     * @dev Remaining time is not considered
     */
    function pausePresaleByEmergency() external whileOnGoing onlyOwner {
        isPresalePaused = true;
        currentPresalePeriod = startTime.add(currentPresalePeriod).sub(
            block.timestamp
        );
        emit PresalePaused(block.timestamp);
    }

    /**
     * @notice Start presale
     * @dev Need to check if requirements are satisfied
     */
    function resumePresale() external whilePaused onlyOwner {
        isPresalePaused = false;
        startTime = block.timestamp;
        emit PresaleResumed(block.timestamp);
    }

    /**
     * @notice Deposit fund token to the pool
     * @dev Receive funds token from the participants with checking the requirements.
     * @param amount amount of fund token
     */
    function deposit(uint256 amount) external whileOnGoing {
        // check if user is in white list
        (address user, , uint256 maxAlloc, ,) = IWhitelist(whitelist).getUser(
            msg.sender
        );
        require(user != address(0), "Deposit: Not exist on the whitelist");

        // calculate fund token balance after deposit
        // we assume private sale is always finished before public sale starts
        // thus rtBalance includes the private sale amount as well
        Recipient storage recp = recipients[msg.sender];
        uint256 newFundBalance = recp.ftBalance.add(amount);
        require(
            maxAlloc + privateSoldFunds[user] >= newFundBalance,
            "Deposit: Can't exceed the maxAlloc!"
        );
        require(
            IERC20(fundToken).transferFrom(msg.sender, address(this), amount),
            "Deposit: Can't transfer fund token!"
        );

        // calculate reward token amount from fund token amount
        uint256 rtAmount = amount
        .mul(10**IERC20(rewardToken).decimals())
        .mul(accuracy)
        .div(exchangeRate)
        .div(10**IERC20(fundToken).decimals());        

        recp.ftBalance = newFundBalance;
        recp.rtBalance = recp.rtBalance.add(rtAmount);
        publicSoldAmount = publicSoldAmount.add(rtAmount);

        if (inserted[user] == false) {
            inserted[user] = true;
            indexOf[user] = participants.length;
            participants.push(user);
        }

        IVesting(vesting).updateRecipient(msg.sender, recp.rtBalance);

        emit Vested(msg.sender, recp.rtBalance, false, block.timestamp);
    }

    /**
     * @notice Withdraw fund tokens to the project owner / charge service fee
     * @dev After presale ends, we withdraw funds to project owner by charging a service fee
     * @param treasury address of the participant
     */
    function withdrawFunds(address treasury) external whileFinished onlyOwner {
        require(
            projectOwner != address(0),
            "withdraw: Project Owner address hasn't been set!"
        );
        require(
            treasury != address(0),
            "withdraw: Treasury can't be zero address"
        );

        uint256 balance = IERC20(fundToken).balanceOf(address(this));
        uint256 feeAmount = balance.mul(serviceFee).div(accuracy);
        uint256 actualFunds = balance.sub(feeAmount);

        require(
            IERC20(fundToken).transfer(projectOwner, actualFunds),
            "withdraw: can't withdraw funds"
        );
        require(
            IERC20(fundToken).transfer(treasury, feeAmount),
            "withdraw: can't withdraw service fee"
        );

        emit WithdrawFunds(projectOwner, actualFunds, block.timestamp);
        emit WithdrawFunds(treasury, feeAmount, block.timestamp);
    }

    /**
     * @notice Withdraw Unsold reward token to the project owner
     * @dev After presale ends, we withdraw unsold rewardToken token to project owner.
     */
    function withdrawUnsoldToken() external whileFinished onlyOwner {
        require(
            projectOwner != address(0),
            "withdraw: Project Owner address hasn't been set!"
        );

        uint256 totalBalance = _getDepositedRewardTokenAmount();
        uint256 totalSoldAmount = privateSoldAmount.add(publicSoldAmount);
        uint256 unsoldAmount = totalBalance.sub(totalSoldAmount);

        require(
            IERC20(rewardToken).transferFrom(
                address(vesting),
                projectOwner,
                unsoldAmount
            ),
            "withdraw: can't withdraw funds"
        );

        emit WithdrawUnsoldToken(projectOwner, unsoldAmount, block.timestamp);
    }

    /**
     * @notice Check if Presale is in progress
     * @dev Check if presale is finished
     */
    function startVesting() external whileFinished onlyOwner {
        IVesting(vesting).setStartTime(block.timestamp + 1);
    }

    /**
     * @notice Check if Presale is in progress
     * @return True: in Presale, False: not started or already ended
     */
    function isPresaleGoing() public view returns (bool) {
        if (isPresalePaused) return false;

        if (_getDepositedRewardTokenAmount() < initialRewardAmount)
            return false;

        uint256 endTime = startTime.add(currentPresalePeriod);
        return block.timestamp >= startTime && block.timestamp <= endTime;
    }

    /**
     * @notice Returns the total vested reward token amount
     * @dev Get the rewardToken token amount of vesting contract
     * @return Reward token balance of vesting contract
     */
    function _getDepositedRewardTokenAmount() internal view returns (uint256) {
        return IERC20(rewardToken).balanceOf(vesting);
    }
}
