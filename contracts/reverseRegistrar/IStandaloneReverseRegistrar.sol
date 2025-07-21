// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice Interface for a standalone reverse registrar.
interface IStandaloneReverseRegistrar {
    /// @notice Emitted when the name for an address is changed.
    ///
    /// @param addr The address of the reverse record.
    /// @param name The name of the reverse record.
    event NameForAddrChanged(address indexed addr, string name);

    /// @notice Returns the name for an address.
    ///
    /// @param addr The address to get the name for.
    /// @return The name for the address.
    function nameForAddr(address addr) external view returns (string memory);
}
