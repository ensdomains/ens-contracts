// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice Interface for the signature reverse resolver
interface ISignatureReverseResolver {
    /// @notice Emitted when the name of a reverse record is changed.
    /// @param addr The address of the reverse record
    /// @param node The ENS node hash of the reverse record
    /// @param name The name of the reverse record
    event NameChanged(address indexed addr, bytes32 indexed node, string name);

    /// @notice Sets the `name()` record for the reverse ENS record associated with
    ///         the addr provided account using a signature.
    /// @param addr The address to set the name for
    /// @param name The name of the reverse record
    /// @param signatureExpiry Date when the signature expires
    /// @param signature The signature from the addr
    /// @return The ENS node hash of the reverse record
    function setNameForAddrWithSignature(
        address addr,
        string calldata name,
        uint256 signatureExpiry,
        bytes calldata signature
    ) external returns (bytes32);

    /// @notice Returns the name associated with an ENS node hash, for reverse resolution.
    ///         Defined in ENSIP-3.
    /// @param node The ENS node hash to query.
    /// @return The associated name.
    function name(bytes32 node) external view returns (string memory);

    /// @notice Returns the ENS node hash for the reverse record associated with
    ///         the addr provided account.
    /// @param addr The address to get the reverse node hash for
    /// @return The ENS node hash
    function node(address addr) external view returns (bytes32);
}
