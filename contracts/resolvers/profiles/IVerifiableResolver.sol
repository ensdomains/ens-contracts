// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

/// @notice A resolver that uses a verifier.
/// @dev Interface selector: `0xed57d294`
interface IVerifiableResolver {
    /// @notice The verifier contract has changed.
    ///         Use `0x00` for any name.
    ///
    /// @param name The DNS-encoded name.
    /// @param verifier The new verifier contract.
    event VerifierChanged(bytes name, address verifier);

    /// @notice Get information about the verification process.
    ///         Use ERC-165 to determine the verifier type.
    ///
    /// @param name The DNS-encoded name.
    ///
    /// @return verifier The verifier contract.
    /// @return gateways The gateways used by the verifier.
    function verifierMetadata(
        bytes memory name
    ) external view returns (address verifier, string[] memory gateways);
}
