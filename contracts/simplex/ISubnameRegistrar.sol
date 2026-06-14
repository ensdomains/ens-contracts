//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

/// @notice Callable API of the SubnameRegistrar: create + index subnames and
///         enumerate them without an indexer.
interface ISubnameRegistrar {
    function createSubname(
        bytes32 parentNode,
        string calldata label
    ) external returns (bytes32 node);

    function submitSubname(
        bytes32 parentNode,
        string calldata label
    ) external;

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
