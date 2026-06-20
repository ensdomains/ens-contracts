//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

/// @notice Callable API of the SubnameRegistrar: create/delete subnames that are
///         soulbound to the parent 2LD NFT, resolve their effective owner, and
///         enumerate them without an indexer.
interface ISubnameRegistrar {
    function createSubname(
        bytes32 parentNode,
        string calldata label
    ) external returns (bytes32 node);

    function deleteSubname(bytes32 parentNode, string calldata label) external;

    /// @notice Permissionless GC of generation-dead subnames.
    function purge(
        bytes32 parentNode,
        bytes32[] calldata labelhashes
    ) external;

    /// @notice Effective owner of a subname node (the 2LD NFT holder); 0 if
    ///         untracked or generation-dead. Used by the resolver's wrapper hook.
    function ownerOf(uint256 node) external view returns (address);

    function childrenLength(
        bytes32 parentNode
    ) external view returns (uint256);

    function getChildren(
        bytes32 parentNode,
        uint256 start,
        uint256 count
    ) external view returns (bytes32[] memory hashes, string[] memory labels);

    function labelOf(bytes32 labelhash) external view returns (string memory);

    function childIndexed(bytes32 node) external view returns (bool);
}
