pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./IMetaDataService.sol";

uint96 constant CANNOT_UNWRAP = 1;
uint96 constant CANNOT_BURN_FUSES = 2;
uint96 constant CANNOT_TRANSFER = 4;
uint96 constant CANNOT_SET_RESOLVER = 8;
uint96 constant CANNOT_SET_TTL = 16;
uint96 constant CANNOT_CREATE_SUBDOMAIN = 32;
uint96 constant CANNOT_REPLACE_SUBDOMAIN = 64;
uint96 constant CAN_DO_EVERYTHING = 0;

interface INameWrapper is IERC1155 {
    event Wrap(
        bytes32 indexed parentNode,
        string indexed label,
        address owner,
        uint96 fuses
    );

    event WrapETH2LD(bytes32 indexed labelhash, address owner, uint96 fuses);

    event Unwrap(
        bytes32 indexed parentNode,
        bytes32 indexed labelhash,
        address owner
    );

    event UnwrapETH2LD(
        bytes32 indexed labelhash,
        address registrant,
        address controller
    );

    event BurnFuses(bytes32 indexed node, uint96 fuses);

    function wrap(
        bytes32 node,
        string calldata label,
        address wrappedOwner,
        uint96 _fuses
    ) external;

    function wrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint96 _fuses
    ) external;

    function unwrap(
        bytes32 node,
        bytes32 label,
        address owner
    ) external;

    function unwrapETH2LD(
        bytes32 label,
        address newRegistrant,
        address newController
    ) external;

    function setSubnodeRecordAndWrap(
        bytes32 node,
        string calldata label,
        address owner,
        address resolver,
        uint64 ttl,
        uint96 _fuses
    ) external returns (bytes32);

    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address owner
    ) external returns (bytes32);

    function setSubnodeOwnerAndWrap(
        bytes32 node,
        string calldata label,
        address newOwner,
        uint96 _fuses
    ) external returns (bytes32);

    function isTokenOwnerOrApproved(bytes32 node, address addr)
        external
        returns (bool);

    function setResolver(bytes32 node, address resolver) external;

    function setTTL(bytes32 node, uint64 ttl) external;

    function getFuses(bytes32 node) external returns (uint96);

    function canUnwrap(bytes32 node) external view returns (bool);

    function canBurnFuses(bytes32 node) external view returns (bool);

    function canTransfer(bytes32 node) external view returns (bool);

    function canSetResolver(bytes32 node) external view returns (bool);

    function canSetTTL(bytes32 node) external view returns (bool);

    function canCreateSubdomain(bytes32 node) external view returns (bool);

    function canReplaceSubdomain(bytes32 node) external view returns (bool);

    function setMetaDataService(IMetaDataService _newMetaDataService) external;

    function uri() external view returns (string memory);
}
