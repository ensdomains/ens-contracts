// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ResolverFeatures {
    /// @notice Implements `resolve(multicall([...]))`.
    /// @dev Feature: `0x96b62db8`
    bytes4 constant RESOLVE_MULTICALL =
        bytes4(keccak256("eth.ens.resolver.extended.multicall"));

    /// @notice Returns the same records independent of name or node.
    /// @dev Feature: `0x86fb8da8`
    bytes4 constant SINGULAR = bytes4(keccak256("eth.ens.resolver.singular"));
}
