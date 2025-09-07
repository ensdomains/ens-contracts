// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev Interface selector: `0xe38f7138`
interface INameReverser {
    /// @notice Resolve multiple EVM addresses to names.
    ///         Caller should enable EIP-3668.
    /// @dev This function may execute over multiple steps.
    /// @param addrs The addresses to resolve.
    /// @return names The resolved names.
    function resolveNames(
        address[] memory addrs
    ) external view returns (string[] memory names);
}
