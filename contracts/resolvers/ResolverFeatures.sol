// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ResolverFeatures {
    /// @notice Implements `resolve(multicall([...]))`.
    /// @dev Feature: `0xcc086793`
    bytes4 constant RESOLVE_MULTICALL =
        bytes4(keccak256("ens.resolver.extended.multicall"));

    /// @notice Returns the same records independent of name or node.
    /// @dev Feature: `0xfaa33450`
    bytes4 constant SINGULAR = bytes4(keccak256("ens.resolver.singular"));
}
