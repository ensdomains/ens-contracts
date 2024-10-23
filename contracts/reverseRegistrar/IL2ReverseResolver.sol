// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice Interface for the L2 reverse resolver
interface IL2ReverseResolver {
    /// @notice Thrown when the specified address is not the owner of the contract
    error NotOwnerOfContract();

    /// @notice Sets the `name()` record for the reverse ENS record associated with
    ///         the calling account.
    /// @param name The name to set
    /// @return The ENS node hash of the reverse record
    function setName(string memory name) external returns (bytes32);

    /// @notice Sets the `name()` record for the reverse ENS record associated with
    ///         the addr provided account.
    ///         Can be used if the addr is a contract that is owned by an SCA.
    /// @param addr The address to set the name for
    /// @param name The name to set
    /// @return The ENS node hash of the reverse record
    function setNameForAddr(
        address addr,
        string memory name
    ) external returns (bytes32);

    /// @notice Sets the `name()` record for the reverse ENS record associated with
    ///         the contract provided that is owned with `Ownable`.
    /// @param contractAddr The address of the contract to set the name for
    /// @param owner The owner of the contract (via Ownable)
    /// @param name The name to set
    /// @param signatureExpiry The expiry of the signature
    /// @param signature The signature of an address that will return true on isValidSignature for the owner
    /// @return The ENS node hash of the reverse record
    function setNameForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string calldata name,
        uint256 signatureExpiry,
        bytes calldata signature
    ) external returns (bytes32);
}
