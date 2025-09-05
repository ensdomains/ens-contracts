// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface for a verifable gateway.
/// @dev Interface selector: `0x5b4f069a`
interface IVerifiableGateway {
    /// @notice Get the verifier.
    /// @return The verifer contract.
    function gatewayVerifier() external view returns (address);
}
