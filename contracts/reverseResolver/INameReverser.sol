// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INameReverser {
    /// @notice Resolve multiple EVM addresses to names.
    ///         Caller should enable EIP-3668.
    /// @dev This function may execute over multiple steps.
    /// @param addrs The addresses to resolve.
    /// @param perPage The maximum number of addresses to resolve per call.
    ///                Ignored if this function does not revert `OffchainLookup`.
    /// @return names The resolved names.
    function resolveNames(
        address[] memory addrs,
        uint8 perPage
    ) external view returns (string[] memory names);
}
