// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @notice Interface for a multicall gateway.
interface IMulticallGateway {
    /// @notice Makes a multicall to the gateway.
    /// @param data The array of calls to make.
    /// @return results The resolved results.
    function multicall(
        bytes[] calldata data
    ) external returns (bytes[] memory results);
}