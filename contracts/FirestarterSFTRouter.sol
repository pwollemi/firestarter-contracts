// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./interfaces/IFirestarterSFTVesting.sol";

contract FirestarterSFTRouter is Initializable, OwnableUpgradeable {
    struct VestingSchedule {
        address creator;
        address collection;
        bool validated;
    }

    // sft collection => vesting contract => vesting schedule
    mapping(address => VestingSchedule) private vestingSchedules;
    // sft collection => vesting contract array
    mapping(address => address[]) private vestings;

    event NewVesting(address vesting, address collection, address creator, bool validated);
    event ValidateVesting(address vesting, bool validated);

    modifier isVesting(address vesting) {
        require(vestingSchedules[vesting].creator != address(0), "Invalid vesting");
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
    }

    /* ========== Router Native Functions ========== */

    function _addVesting(
        address vesting,
        address collection,
        address creator,
        bool validated
    ) private {
        vestingSchedules[vesting] = VestingSchedule({creator: creator, collection: collection, validated: validated});

        vestings[collection].push(vesting);

        emit NewVesting(vesting, collection, creator, validated);
    }

    function addVestingByAdmin(address collection, address vesting) external onlyOwner {
        require(vestingSchedules[vesting].creator == address(0), "Vesting already added");

        _addVesting(vesting, collection, msg.sender, true);
    }

    function addVesting(address collection, address vesting) external {
        require(vestingSchedules[vesting].creator == address(0), "Vesting already added");

        _addVesting(vesting, collection, msg.sender, false);
    }

    function validateVesting(address vesting, bool validated) external onlyOwner {
        require(vestingSchedules[vesting].creator != address(0), "Vesting already added");

        vestingSchedules[vesting].validated = validated;

        emit ValidateVesting(vesting, validated);
    }

    function getAllVestingsOfCollection(address collection) public view returns (address[] memory) {
        return vestings[collection];
    }

    function getVestingInfo(address vesting) public view returns (VestingSchedule memory) {
        return vestingSchedules[vesting];
    }

    /* ========== Vesting Wrapper Functions ========== */

    function participantCount(address vesting) external view isVesting(vesting) returns (uint256) {
        return IFirestarterSFTVesting(vesting).participantCount();
    }

    function getParticipants(
        address vesting,
        uint256 page,
        uint256 limit
    ) external view isVesting(vesting) returns (address[] memory) {
        return IFirestarterSFTVesting(vesting).getParticipants(page, limit);
    }

    function vested(address vesting, uint256 tokenId) external view isVesting(vesting) returns (uint256) {
        return IFirestarterSFTVesting(vesting).vested(tokenId);
    }

    function locked(address vesting, uint256 tokenId) external view isVesting(vesting) returns (uint256) {
        return IFirestarterSFTVesting(vesting).locked(tokenId);
    }

    function withdrawable(address vesting, uint256 tokenId) external view isVesting(vesting) returns (uint256) {
        return IFirestarterSFTVesting(vesting).withdrawable(tokenId);
    }

    function withdraw(address vesting, uint256 tokenId) external isVesting(vesting) {
        IFirestarterSFTVesting(vesting).withdraw(tokenId);
    }
}
