// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface for shared gateway URLs.
/// @dev Interface selector: `0x093a86d3`
interface IGatewayProvider {
    /// @notice Get the gateways.
    /// @return The gateway URLs.
    function gateways() external view returns (string[] memory);
}
