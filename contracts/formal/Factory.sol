// SPDX-License-Identifier: UNLICENSED
pragma experimental ABIEncoderV2;
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "./Presale.sol";
import "./Whitelist.sol";
import "./Vesting.sol";

contract Factory is AccessControlEnumerable {
    struct Project {
        address PO; // Project Owner
        address CP; // Presale Contract
        address CW; // Whitelist Contract
        address CV; // Vesting Contract
    }

    mapping(string => Project) public PL; // Project ID => Project Info

    /********************** Events ***********************/
    event AddProject(address indexed, string, address[4], uint256);

    /********************** Modifiers ***********************/
    modifier onlyOwner() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Requires Owner Role");
        _;
    }

    constructor(address[] memory _initialOwners) {
        // At first only deployer can manage the factory contract
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // This initialOwner will grant admin role to others
        for (uint256 i = 0; i < _initialOwners.length; i++) {
            _setupRole(DEFAULT_ADMIN_ROLE, _initialOwners[i]);
        }
    }

    function addProject(
        string calldata _id,
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
        _CV.init(address(_CP));

        PL[_id].PO = _addrs[2];
        PL[_id].CP = address(_CP);
        PL[_id].CW = address(_CW);
        PL[_id].CV = address(_CV);

        address[4] memory _logs =
            [_addrs[2], address(_CP), address(_CW), address(_CV)];

        string memory logId = _id;
        emit AddProject(msg.sender, logId, _logs, block.timestamp);

        return (address(_CP), address(_CW), address(_CV));
    }
}
