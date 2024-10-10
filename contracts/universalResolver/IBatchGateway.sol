// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IMulticallGateway} from "./IMulticallGateway.sol";

/// @notice Interface for a batch gateway.
interface IBatchGateway is IMulticallGateway {
    /// @notice Makes a single query to the gateway.
    /// @param sender The sender address of the lookup.
    /// @param urls The URLs of the lookup.
    /// @param callData The callData of the lookup.
    /// @return response The response from the gateway.
    function query(
        address sender,
        string[] memory urls,
        bytes memory callData
    ) external returns (bytes memory response);
}
