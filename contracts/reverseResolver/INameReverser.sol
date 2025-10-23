// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice A resolver for primary name resolution.
/// @dev Interface selector: `0x6beeaa0d`
interface INameReverser {
    /// @notice Resolve multiple EVM addresses to names.
    ///         Caller should enable EIP-3668.
    /// @dev This function may execute over multiple steps.
    /// @param addrs The addresses to resolve.
    /// @return names The resolved names.
    function resolveNames(
        address[] memory addrs
    ) external view returns (string[] memory names);

    /// @notice The coin type for the resolver.
    function coinType() external view returns (uint256);

    /// @notice The EVM Chain ID derived from `coinType()`.
    function chainId() external view returns (uint32);

    /// @notice The reverse registrar address on the corresponding chain.
    ///         The address returned by `addr(coinType)` for the resolver.
    function chainRegistrar() external view returns (address);
}
