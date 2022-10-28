// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract FlamePool is Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct UserInfo {
        uint256 amount;
        int256 rewardDebt;
    }

    uint256 private constant ACC_REWARD_PRECISION = 1e12;

    address public flameToken;
    address public rewardToken;

    uint256 public accRewardPerShare;
    uint256 public lastRewardTimestamp;
    uint256 public rewardPerSec;

    bool public activateDistribution;

    mapping(address => UserInfo) public userInfo;

    event Deposit(address indexed user, uint256 amount, address indexed to);
    event Withdraw(address indexed user, uint256 amount, address indexed to);
    event Harvest(address indexed user, uint256 amount);
    event LogUpdatePool(uint256 lastRewardTimestamp, uint256 flameSupply, uint256 accRewardPerShare);

    modifier activeDistribution() {
        require(activateDistribution, "Not active distribution");
        _;
    }

    function initialize(
        address _flameToken,
        address _rewardToken,
        uint256 _rewardPerSec
    ) external initializer {
        __Ownable_init();

        require(_flameToken != address(0), "Invalid token address");
        require(_rewardToken != address(0), "Invalid token address");

        flameToken = _flameToken;
        rewardToken = _rewardToken;
        rewardPerSec = _rewardPerSec;
        activateDistribution = true;
    }

    function setActiveDistribution(bool _activateDistribution) external onlyOwner {
        activateDistribution = _activateDistribution;
    }

    function setRewardPerSec(uint256 _rewardPerSec) external onlyOwner {
        rewardPerSec = _rewardPerSec;
    }

    function rescueToken(address token, uint256 amount) external onlyOwner {
        require(token != flameToken, "Invalid token address");

        IERC20Upgradeable(token).transfer(owner(), amount);
    }

    function pendingReward(address _user) external view returns (uint256 pending) {
        UserInfo storage user = userInfo[_user];
        uint256 flameSupply = IERC20Upgradeable(flameToken).balanceOf(address(this));
        uint256 _accRewardPerShare = accRewardPerShare;
        if (block.timestamp > lastRewardTimestamp && flameSupply != 0) {
            uint256 duration = block.timestamp - lastRewardTimestamp;
            uint256 rewardAmount = duration * rewardPerSec;
            _accRewardPerShare = _accRewardPerShare + (rewardAmount * ACC_REWARD_PRECISION) / flameSupply;
        }
        pending = toUInt256(int256((user.amount * _accRewardPerShare) / ACC_REWARD_PRECISION) - user.rewardDebt);
    }

    function updatePool() public {
        if (block.timestamp > lastRewardTimestamp) {
            uint256 flameSupply = IERC20Upgradeable(flameToken).balanceOf(address(this));
            if (flameSupply > 0) {
                uint256 duration = block.timestamp - lastRewardTimestamp;
                uint256 rewardAmount = duration * rewardPerSec;
                accRewardPerShare = accRewardPerShare + (rewardAmount * ACC_REWARD_PRECISION) / flameSupply;
            }
            lastRewardTimestamp = block.timestamp;

            emit LogUpdatePool(lastRewardTimestamp, flameSupply, accRewardPerShare);
        }
    }

    function deposit(uint256 amount, address to) external activeDistribution {
        updatePool();

        UserInfo storage user = userInfo[to];

        // Effects
        user.amount = user.amount + amount;
        user.rewardDebt = user.rewardDebt + int256((amount * accRewardPerShare) / ACC_REWARD_PRECISION);

        IERC20Upgradeable(flameToken).safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(msg.sender, amount, to);
    }

    function withdraw(uint256 amount, address to) external activeDistribution {
        updatePool();
        UserInfo storage user = userInfo[msg.sender];

        // Effects
        user.rewardDebt = user.rewardDebt - int256((amount * accRewardPerShare) / ACC_REWARD_PRECISION);
        user.amount = user.amount - amount;

        IERC20Upgradeable(flameToken).safeTransfer(to, amount);

        emit Withdraw(msg.sender, amount, to);
    }

    function harvest(address to) external activeDistribution {
        updatePool();
        UserInfo storage user = userInfo[msg.sender];
        int256 accumulatedReward = int256((user.amount * accRewardPerShare) / ACC_REWARD_PRECISION);
        uint256 _pendingReward = toUInt256(accumulatedReward - user.rewardDebt);

        // Effects
        user.rewardDebt = accumulatedReward;

        // Interactions
        if (_pendingReward != 0) {
            IERC20Upgradeable(rewardToken).safeTransfer(to, _pendingReward);
        }

        emit Harvest(msg.sender, _pendingReward);
    }

    function withdrawAndHarvest(uint256 amount, address to) external activeDistribution {
        updatePool();
        UserInfo storage user = userInfo[msg.sender];
        int256 accumulatedReward = int256((user.amount * accRewardPerShare) / ACC_REWARD_PRECISION);
        uint256 _pendingReward = toUInt256(accumulatedReward - user.rewardDebt);

        // Effects
        user.rewardDebt = user.rewardDebt - int256((amount * accRewardPerShare) / ACC_REWARD_PRECISION);
        user.amount = user.amount - amount;

        // Interactions
        IERC20Upgradeable(rewardToken).safeTransfer(to, _pendingReward);
        IERC20Upgradeable(flameToken).safeTransfer(to, amount);

        emit Withdraw(msg.sender, amount, to);
        emit Harvest(msg.sender, _pendingReward);
    }

    function toUInt256(int256 a) internal pure returns (uint256) {
        require(a >= 0, "Integer < 0");
        return uint256(a);
    }
}
