// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./libraries/AddressPagination.sol";
import "./interfaces/IERC20Extended.sol";
import "./interfaces/IMerkleWhitelist.sol";
import "./interfaces/IVesting.sol";

/// @title Firestarter Presale Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract for presale of projects
/// @dev All function calls are currently implemented without side effects
contract Presale is Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressPagination for address[];

    struct Recipient {
        // Deposited Funds token amount of the recipient
        uint256 ftBalance;
        // Rewards Token amount that needs to be vested
        uint256 rtBalance;
        // True if has withdrawn refunded funds
        bool refunded;
    }

    struct AddressParams {
        // Fund token
        address fundToken;
        // Reward token(from the project)
        address rewardToken;
        // Owner of this project
        address projectOwner;
        // Contract that managers whitelisted users
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
        // Service Fee : if `ACCURACY` is 1e10(default), 1e9 is 10%
        uint256 serviceFee;
        // Initial Deposited rewardToken amount
        uint256 initialRewardsAmount;
        // Timestamp when listing happens
        uint256 listTime;
        // Refund period
        uint256 refundPeriod;
    }

    /// @notice General decimal values ACCURACY unless specified differently (e.g. fees, exchange rates)
    uint256 public constant ACCURACY = 1e10;

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

    /********************** Presale Params ***********************/

    /// @notice Fixed Rate between fundToken vs rewardsToken = rewards / funds * ACCURACY
    uint256 public exchangeRate;

    /// @notice Presale Period
    uint256 public presalePeriod;

    /// @notice Period to fill the cap
    uint256 public closePeriod;

    /// @notice Presale Start Time
    uint256 public startTime;

    /// @notice Refund List Time
    uint256 public listTime;

    /// @notice Refund Period
    uint256 public refundPeriod;

    /// @notice Service Fee : if `ACCURACY` is 1e10(default), 1e9 is 10%
    uint256 public serviceFee;

    /// @notice Initial Deposited rewardToken amount
    uint256 public initialRewardAmount;

    /********************** Status Infos ***********************/

    /// @dev Private sale status
    bool public isPrivateSaleOver;

    /// @notice Presale pause status
    bool public isPresalePaused;

    /// @notice If unsold reward token is withdrawn, set to true(false by default)
    bool public unsoldTokenWithdrawn;

    /// @notice Presale remaining time if paused
    uint256 public currentPresalePeriod;

    /// @dev Reward token amount sold by Private Sale (init with default value)
    uint256 public privateSoldAmount;

    /// @notice Reward token amount sold by Public Sale (init with default value)
    uint256 public publicSoldAmount;

    /// @notice Record of fund token amount sold in Private Presale (init with default value)
    mapping(address => uint256) public privateSoldFunds;

    /// @notice Participants information (init with default value)
    mapping(address => Recipient) public recipients;

    // Participants list (init with default value)
    address[] internal participants;
    mapping(address => uint256) internal indexOf;
    mapping(address => bool) internal inserted;

    /// @notice An event emitted when the private sale is done
    event PrivateSaleDone(uint256);

    /// @notice An event emitted when presale is started
    event PresaleManuallyStarted(uint256);

    /// @notice An event emitted when presale is paused
    event PresalePaused(uint256);

    /// @notice An event emitted when presale is resumed
    event PresaleResumed(uint256);

    /// @notice An event emitted when a user vested reward token
    event Vested(address indexed user, uint256 amount, bool isPrivate, uint256 timestamp);

    /// @notice An event emitted when the remaining reward token is withdrawn
    event WithdrawUnsoldToken(address indexed receiver, uint256 amount, uint256 timestamp);

    /// @notice An event emitted when refund is activated
    event Refunded(address indexed user, uint256 fundAmount, uint256 tokenAmount);

    /// @notice An event emitted when funded token is withdrawn(project owner and service fee)
    event WithdrawFunds(address indexed receiver, uint256 amount, uint256 timestamp);

    /// @notice An event emitted when startTime is set
    event StartTimeSet(uint256 startTime);

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

    function initialize(AddressParams memory _addrs, PresaleParams memory _presale)
        external
        initializer
    {
        require(_addrs.fundToken != address(0), "fund token address cannot be zero");
        require(_addrs.rewardToken != address(0), "reward token address cannot be zero");
        require(_addrs.projectOwner != address(0), "project owner address cannot be zero");
        require(_addrs.whitelist != address(0), "whitelisting contract address cannot be zero");
        require(_addrs.vesting != address(0), "init: vesting contract address cannot be zero");

        require(_presale.startTime > block.timestamp, "start time must be in the future");
        require(_presale.rate > 0, "exchange rate cannot be zero");
        require(_presale.period > 0, "presale period cannot be zero");

        __Ownable_init();

        fundToken = _addrs.fundToken;
        rewardToken = _addrs.rewardToken;
        projectOwner = _addrs.projectOwner;
        whitelist = _addrs.whitelist;
        vesting = _addrs.vesting;

        exchangeRate = _presale.rate;
        startTime = _presale.startTime;
        presalePeriod = _presale.period;
        listTime = _presale.listTime;
        refundPeriod = _presale.refundPeriod;
        closePeriod = 3600;
        serviceFee = _presale.serviceFee;
        initialRewardAmount = _presale.initialRewardsAmount;

        currentPresalePeriod = presalePeriod;
    }

    /**
     * @notice Set the fill period
     */
    function setClosePeriod(uint256 _closePeriod) external onlyOwner {
        closePeriod = _closePeriod;
    }

    /**
     * @notice Return the number of participants
     */
    function participantCount() external view returns (uint256) {
        return participants.length;
    }

    /**
     * @notice Return the list of participants
     */
    function getParticipants(uint256 page, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        return participants.paginate(page, limit);
    }

    /**
     * @notice Finish Private Sale
     * @dev Only owner can end private sale
     */
    function endPrivateSale() external onlyOwner {
        isPrivateSaleOver = true;

        if (startTime < block.timestamp) startTime = block.timestamp;

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
        require(newStartTime > block.timestamp, "setStartTime: Should be time in future");

        startTime = newStartTime;

        emit StartTimeSet(newStartTime);
    }

    /**
     * @notice Start presale
     * @dev Need to check if requirements are satisfied
     */
    function startPresale() external whileDeposited onlyOwner {
        require(isPrivateSaleOver == true, "startPresale: Private Sale has not been done yet!");

        require(startTime > block.timestamp, "startPresale: Presale has been already started!");

        startTime = block.timestamp;

        emit PresaleManuallyStarted(block.timestamp);
    }

    function extendPeriod(uint256 extendTime) external onlyOwner {
        presalePeriod = presalePeriod + extendTime;
        currentPresalePeriod = currentPresalePeriod + extendTime;
    }

    /**
     * @notice Pause the ongoing presale by mergency
     * @dev Remaining time is not considered
     */
    function pausePresaleByEmergency() external whileOnGoing onlyOwner {
        isPresalePaused = true;
        currentPresalePeriod = startTime + currentPresalePeriod - block.timestamp;
        emit PresalePaused(block.timestamp);
    }

    /**
     * @notice Resume presale
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
     * @param amount        amount of fund token
     * @param alloInfo      whitelist info of the user
     * @param merkleProof   proof array
     */
    function deposit(uint256 amount, IMerkleWhitelist.UserData memory alloInfo, bytes32[] memory merkleProof) external whileOnGoing {
        // check if user is in white list
        require(msg.sender == alloInfo.wallet, "Deposit: Invalid alloInfo");
        require(IMerkleWhitelist(whitelist).verify(alloInfo, merkleProof), "Deposit: Not exist on the whitelist");
        require(alloInfo.isKycPassed, "Deposit: Not passed KYC");

        if (alloInfo.privateMaxAlloc > 0) {
            require(isClosePeriod(), "Deposit: Must be in fill period for private participants to buy in public");
        }

        // calculate fund token balance after deposit
        // we assume private sale is always finished before public sale starts
        // thus rtBalance includes the private sale amount as well
        Recipient storage recp = recipients[msg.sender];
        uint256 newFundBalance = recp.ftBalance + amount;

        // `newFundBalance` includes sold token amount both in private presale and public presale,
        // but `publicMaxAlloc` is only for public presale
        require(
            alloInfo.publicMaxAlloc + privateSoldFunds[msg.sender] >= newFundBalance,
            "Deposit: Can't exceed the publicMaxAlloc!"
        );

        IERC20Upgradeable(fundToken).safeTransferFrom(msg.sender, address(this), amount);

        // calculate reward token amount from fund token amount
        uint256 rtAmount = (amount * (10**IERC20Extended(rewardToken).decimals()) * ACCURACY) /
            exchangeRate /
            (10**IERC20Extended(fundToken).decimals());

        recp.ftBalance = newFundBalance;
        recp.rtBalance = recp.rtBalance + rtAmount;
        publicSoldAmount = publicSoldAmount + rtAmount;

        if (inserted[msg.sender] == false) {
            inserted[msg.sender] = true;
            indexOf[msg.sender] = participants.length;
            participants.push(msg.sender);
        }

        IVesting(vesting).updateRecipient(msg.sender, recp.rtBalance);

        emit Vested(msg.sender, recp.rtBalance, false, block.timestamp);
    }

    /**
     * @notice Process refunds
     */
    function redeemFunds() external whileFinished {
        require(block.timestamp >= listTime, "Not listed yet");
        require(block.timestamp < listTime + refundPeriod, "Refund period ended");

        Recipient storage recp = recipients[msg.sender];
        require(recp.refunded == false, "Already redeemed");

        recp.refunded = true;
        IVesting(vesting).refundRecipient(msg.sender);

        emit Refunded(msg.sender, recp.ftBalance, recp.rtBalance);

        IERC20Upgradeable(fundToken).safeTransfer(msg.sender, recp.ftBalance);
        IERC20Upgradeable(rewardToken).safeTransferFrom(address(vesting), projectOwner, recp.rtBalance);
    }

    /**
     * @notice Process fund tokens and start vesting at given time
     *
     *  - accepts two parameters (treasury address and start vesting time)
     *  - withdraws both fund and reward tokens
     *  - starts vesting from parameter
     *
     * @param treasury     address of the participant
     * @param vestingTime  time to start vesting
     */
    function processFundsAndStartVesting(address treasury, uint256 vestingTime) external whileFinished onlyOwner {
        _withdrawFunds(treasury);
        _withdrawUnsoldToken();
        _startVesting(vestingTime);
    }

    /**
     * @notice Process fund tokens and start vesting immediately
     *
     *  - accepts two parameters (treasury address and start vesting time)
     *  - withdraws both fund and reward tokens
     *  - starts vesting immediately
     *
     * @param treasury     address of the participant
     */
    function processFundsAndStartVestingImmediately(address treasury) external whileFinished onlyOwner {
        _withdrawFunds(treasury);
        _withdrawUnsoldToken();
        _startVesting(block.timestamp + 1);
    }

    /**
     * @notice Withdraw fund tokens to the project owner / charge service fee
     * @dev After presale ends, we withdraw funds to project owner by charging a service fee
     * @param treasury address of the participant
     */
    function withdrawFunds(address treasury) external whileFinished onlyOwner {
        _withdrawFunds(treasury);
    }

    /**
     * @notice Withdraw Unsold reward token to the project owner
     * @dev After presale ends, we withdraw unsold rewardToken token to project owner.
     */
    function withdrawUnsoldToken() external whileFinished onlyOwner {
        _withdrawUnsoldToken();
    }

    /**
     * @notice Start vesting
     * @dev Check if presale is finished
     */
    function startVesting() external whileFinished onlyOwner {
        _startVesting(block.timestamp + 1);
    }

    /**
     * @notice Check if Presale is in progress
     * @return True: in Presale, False: not started or already ended
     */
    function isPresaleGoing() public view returns (bool) {
        if (isPresalePaused) return false;

        if (_getDepositedRewardTokenAmount() < initialRewardAmount) return false;

        uint256 endTime = startTime + currentPresalePeriod;
        return block.timestamp >= startTime && block.timestamp <= endTime;
    }

    /**
     * @notice Check if current is fill period
     * @return True: in fill period, False: still public sale phase or presale finished
     */
    function isClosePeriod() public view returns (bool) {
        uint256 endTime = startTime + currentPresalePeriod;
        return block.timestamp >= (endTime - closePeriod) && block.timestamp <= endTime;
    }

    /**
     * @notice Returns the total vested reward token amount
     * @dev Get the rewardToken token amount of vesting contract
     * @return Reward token balance of vesting contract
     */
    function _getDepositedRewardTokenAmount() internal view returns (uint256) {
        return IERC20Upgradeable(rewardToken).balanceOf(vesting);
    }

    /**
     * @notice Withdraw fund tokens to the project owner / charge service fee
     * @dev After presale ends, we withdraw funds to project owner by charging a service fee
     * @param treasury address of the participant
     */
    function _withdrawFunds(address treasury) internal {
        require(treasury != address(0), "withdraw: Treasury can't be zero address");

        uint256 balance = IERC20Upgradeable(fundToken).balanceOf(address(this));
        uint256 feeAmount = (balance * serviceFee) / ACCURACY;
        uint256 actualFunds = balance - feeAmount;

        emit WithdrawFunds(projectOwner, actualFunds, block.timestamp);
        emit WithdrawFunds(treasury, feeAmount, block.timestamp);

        IERC20Upgradeable(fundToken).safeTransfer(projectOwner, actualFunds);
        IERC20Upgradeable(fundToken).safeTransfer(treasury, feeAmount);
    }

    /**
     * @notice Withdraw Unsold reward token to the project owner
     * @dev After presale ends, we withdraw unsold rewardToken token to project owner.
     */
    function _withdrawUnsoldToken() internal {
        unsoldTokenWithdrawn = true;

        uint256 totalBalance = _getDepositedRewardTokenAmount();
        uint256 totalSoldAmount = privateSoldAmount + publicSoldAmount;
        uint256 unsoldAmount = totalBalance - totalSoldAmount;

        emit WithdrawUnsoldToken(projectOwner, unsoldAmount, block.timestamp);

        IERC20Upgradeable(rewardToken).safeTransferFrom(address(vesting), projectOwner, unsoldAmount);
    }

    /**
     * @notice Start vesting
     * @dev Check if presale is finished
     */
    function _startVesting(uint256 vestingTime) internal {
        require(
            unsoldTokenWithdrawn,
            "startVesting: can only start vesting after withdrawing unsold tokens"
        );

        IVesting(vesting).setStartTime(vestingTime);
    }
}
