// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IDelegatableResolver {
    function approve(bytes memory name, address owner, bool approved) external;

    function getAuthorisedNode(
        bytes memory name,
        uint256 offset
    ) external returns (bytes32 node, address owner);

    function contractowner() external view returns (address);
}
