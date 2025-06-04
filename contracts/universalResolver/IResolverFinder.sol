// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IResolverFinder {
    function findResolver(
        bytes memory name
    ) external view returns (address resolver, bytes32 node, uint256 offset);
}
