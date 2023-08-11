//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

interface IBulkSubnames {
    function bulkSetSubnodeOwner (
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        address owner
     ) external;

    function bulkSetSubnodeRecord (
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        address owner,
        address resolver,
        uint64 ttl
    ) external;

    function bulkSetWrappedSubnodeOwner (
        bytes32 parentNode,
        string[] calldata labels,
        address wrappedOwner,
        uint32 fuses,
        uint64 expiry
     ) external;

    function bulkSetWrappedSubnodeRecord (
        bytes32 parentNode,
        string[] calldata labels,
        address wrappedOwner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) external;

    function bulkSetChildFuses(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        uint32 fuses,
        uint64 expiry
    ) external;

    function bulkExtendExpiry(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        uint64 expiry
    ) external;

    function bulkUnwrap(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        address controller
    ) external;
}