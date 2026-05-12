// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice Interface for the L2 Reverse Registrar.
interface IL2ReverseRegistrar {
    /// @notice Sets the `nameForAddr()` record for the calling account.
    ///
    /// @param name The name to set.
    function setName(string memory name) external;

    /// @notice Sets the `nameForAddr()` record for the addr provided account.
    ///
    /// @param addr The address to set the name for.
    /// @param name The name to set.
    function setNameForAddr(address addr, string memory name) external;

    /// @notice Sets the `nameForAddr()` record for the addr provided account using a signature.
    ///
    /// @param addr The address to set the name for.
    /// @param name The name to set.
    /// @param coinTypes The coin types to set. Must be inclusive of the coin type for the contract.
    /// @param signatureExpiry Date when the signature expires.
    /// @param signature The signature from the addr.
    function setNameForAddrWithSignature(
        address addr,
        uint256 signatureExpiry,
        string memory name,
        uint256[] memory coinTypes,
        bytes memory signature
    ) external;

    /// @notice Sets the `nameForAddr()` record for the contract provided that is owned with `Ownable`.
    ///
    /// @param contractAddr The address of the contract to set the name for (implementing Ownable).
    /// @param owner The owner of the contract (via Ownable).
    /// @param signatureExpiry The expiry of the signature.
    /// @param name The name to set.
    /// @param coinTypes The coin types to set. Must be inclusive of the coin type for the contract.
    /// @param signature The signature of an address that will return true on isValidSignature for the owner.
    function setNameForOwnableWithSignature(
        address contractAddr,
        address owner,
        uint256 signatureExpiry,
        string memory name,
        uint256[] memory coinTypes,
        bytes memory signature
    ) external;
}
