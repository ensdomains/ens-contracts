pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

uint96 constant CANNOT_UNWRAP = 1;
uint96 constant CANNOT_BURN_FUSES = 2;
uint96 constant CANNOT_TRANSFER = 4;
uint96 constant CANNOT_SET_RESOLVER = 8;
uint96 constant CANNOT_SET_TTL = 16;
uint96 constant CANNOT_CREATE_SUBDOMAIN = 32;
uint96 constant CANNOT_REPLACE_SUBDOMAIN = 64;
uint96 constant CAN_DO_EVERYTHING = 0;

interface INFTFuseWrapper is IERC1155 {
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

    function isOwnerOrApproved(bytes32 node, address addr)
        external 
      
        returns (bool);

    function setResolver(bytes32 node, address resolver) external;

    function setTTL(bytes32 node, uint64 ttl) external;
}

// events for wrapping names, unwrap, setFuses
// Then log the event. parentNode, label (string), fuses, owner
