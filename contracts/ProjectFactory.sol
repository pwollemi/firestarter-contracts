// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Presale.sol";
import "./Whitelist.sol";
import "./Vesting.sol";

/// @title Firestarter ProjectFactory Contract
/// @author Michael, Daniel Lee
/// @notice You can use this contract to add new projects
/// @dev All function calls are currently implemented without side effects
contract ProjectFactory is Ownable {
    struct Project {
        // Project Owner
        address projectOwner;
        // Presale Contract
        address presale;
        // Whitelist Contract
        address whitelist;
        // Vesting Contract
        address vesting;
    }

    struct ProjectParams {
        // Fund token
        address fundToken;
        // Reward token(from the project)
        address rewardToken;
        // Owner of this project
        address projectOwner;
    }

    /// @notice Project List: Project ID => Project Info
    mapping(string => Project) public PL;

    /// @notice An event emitted when a new project is added
    event AddProject(
        address indexed sender,
        string id,
        Project project,
        uint256 timestamp
    );

    constructor() {}

    /**
     * @notice Add a new project
     * @dev Only owner can do this operation
     * @param _id ID of the new project
     * @param _addrs addresses of tokens and owner
     * @param _presaleParams Presale parameters
     * @param _vestingParams Vesting paramsters
     * @param _initialOwner Owner
     * @return presale, whitelist, vesting contract addresses
     */
    function addProject(
        string memory _id,
        ProjectParams memory _addrs,
        Presale.PresaleParams memory _presaleParams,
        Vesting.VestingParams memory _vestingParams,
        address _initialOwner
    )
        external
        onlyOwner
        returns (
            address,
            address,
            address
        )
    {
        Whitelist whitelist = new Whitelist();
        whitelist.initialize();
        whitelist.transferOwnership(_initialOwner);

        Vesting vesting = new Vesting();
        vesting.initialize(_addrs.rewardToken, _vestingParams);

        Presale.AddressParams memory addrs = Presale.AddressParams({
            fundToken: _addrs.fundToken,
            rewardToken: _addrs.rewardToken,
            projectOwner: _addrs.projectOwner,
            whitelist: address(whitelist),
            vesting: address(vesting)
        });

        Presale presale = new Presale();
        presale.initialize(addrs, _presaleParams);
        presale.transferOwnership(_initialOwner);

        // Set the owner of vesting to presale contract
        vesting.init(address(presale));

        Project storage newProject = PL[_id];
        newProject.projectOwner = _addrs.projectOwner;
        newProject.presale = address(presale);
        newProject.whitelist = address(whitelist);
        newProject.vesting = address(vesting);

        emit AddProject(msg.sender, _id, newProject, block.timestamp);

        return (address(presale), address(whitelist), address(vesting));
    }
}
