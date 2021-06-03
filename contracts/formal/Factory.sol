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
        address CW; // Whitelist Contract
        address CP; // Presale Contract
        address CV; // Vesting Contract
        address FT; // Funds Token
        address RT; // Rewards Token
        uint256 ER; // Exchange Rate
        uint256 SF; // Service Fee
        uint256 PT; // Presale Start Time
        uint256 PP; // Presale Period
        uint256 goalFunds;
    }

    mapping(address => Project) public projectList; // Project Owner Address => Project Info
    /********************** Events ***********************/

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
        address[3] calldata _addrs, // FT, RT, PO
        uint256[6] calldata _presaleParams, // 0:ER, 1:PT, 2:PP, 3:SF, 4:GF, 5: IDR
        uint256[4] calldata _vestingParams, // 0:IU, 1:WI, 2:RR, 3:LP
        address[] calldata _initialOwners
    ) external onlyOwner {
        address[5] memory _params;

        for (uint256 i = 0; i < 3; i++) {
            _params[i] = _addrs[i];
        }

        Whitelist _CW = new Whitelist(_initialOwners);
        _params[3] = address(_CW);

        Vesting _CV = new Vesting(_addrs[1], _vestingParams);
        _params[4] = address(_CV);

        Presale _CP = new Presale(_params, _presaleParams, _initialOwners);

        _CV.transferOwnership(address(_CP));
        projectList[_addrs[2]].CP = address(_CP);
        projectList[_addrs[2]].CW = address(_CW);
        projectList[_addrs[2]].CV = address(_CV);

        // projectList[_addrs[2]].FT = _addrs[0];
        // projectList[_addrs[2]].RT = _addrs[1];
        // projectList[_addrs[2]].ER = _vals[1];
        // projectList[_addrs[2]].SF = _vals[4];
        // projectList[_addrs[2]].PT = _vals[2];
        // projectList[_addrs[2]].PP = _vals[3];
        // projectList[_addrs[2]].goalFunds = _vals[0];
    }
}
