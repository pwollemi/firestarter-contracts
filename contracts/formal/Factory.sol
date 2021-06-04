// SPDX-License-Identifier: UNLICENSED
pragma experimental ABIEncoderV2;
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "./Presale.sol";
import "./Whitelist.sol";
import "./Vesting.sol";

contract Factory is Context, AccessControlEnumerable {
    struct Project {
        address PO; // Project Owner
        address CP; // Presale Contract
        address CW; // Whitelist Contract
        address CV; // Vesting Contract
    }

    mapping(string => Project) public projectList; // Project Owner Address => Project Info
    /********************** Events ***********************/
    event AddProject(string, address, address, address, address, uint256);

    /********************** Modifiers ***********************/
    modifier onlyOwner() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "Requires Owner Role"
        );
        _;
    }

    constructor(address[] memory _initialOwners) {
        // At first only deployer can manage the factory contract
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        // This initialOwner will grant admin role to others
        for (uint256 i = 0; i < _initialOwners.length; i++) {
            _setupRole(DEFAULT_ADMIN_ROLE, _initialOwners[i]);
        }
    }

    function addProject(
        string calldata id,
        address[3] calldata _addrs, // FT, RT, PO
        uint256[6] calldata _presaleParams, // 0:ER, 1:PT, 2:PP, 3:SF, 4:GF, 5: IDR
        uint256[4] calldata _vestingParams, // 0:IU, 1:WI, 2:RR, 3:LP
        address[] calldata _initialOwners
    )
        external
        onlyOwner
        returns (
            address,
            address,
            address
        )
    {
        address[5] memory _params;

        for (uint256 i = 0; i < 3; i++) {
            _params[i] = _addrs[i];
        }

        Whitelist _CW = new Whitelist(_initialOwners);
        _params[3] = address(_CW);

        Vesting _CV = new Vesting(_addrs[1], _vestingParams);
        _params[4] = address(_CV);

        Presale _CP = new Presale(_params, _presaleParams, _initialOwners);

        // For let presale to change the states of CV
        _CV.transferOwnership(address(_CP));

        projectList[id].PO = _addrs[2];
        projectList[id].CP = address(_CP);
        projectList[id].CW = address(_CW);
        projectList[id].CV = address(_CV);

        emit AddProject(
            id,
            _addrs[2],
            address(_CP),
            address(_CW),
            address(_CV),
            block.timestamp
        );
        return (address(_CP), address(_CW), address(_CV));
    }
}
