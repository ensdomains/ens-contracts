// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IDelegatableResolver {
    function approve(
        bytes memory name,
        address operator,
        bool approved
    ) external;

    function getAuthorisedNode(
        bytes memory name,
        uint256 offset,
        address operator
    ) external returns (bytes32 node, bool authorized);

    function owner() external view returns (address);
}
