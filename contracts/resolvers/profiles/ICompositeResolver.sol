// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IExtendedResolver} from "./IExtendedResolver.sol";

/// @notice A resolver that calls other resolvers.
/// @dev Interface selector: `0xf686ea10`
interface ICompositeResolver is IExtendedResolver {
    /// @notice Fetch the underlying resolver for `name`.
    ///         Callers should enable EIP-3668.
	///
	/// * If `offchain`, additional information is necessary to locate `resolver`.
	/// * If `resolver` is null, `offchain` is irrelevant.
    ///
    /// @param name The DNS-encoded name.
    ///
    /// @return resolver The underlying resolver address.
    /// @return offchain `true` if `resolver` is offchain.
    function getResolver(bytes memory name) external view returns (address resolver, bool offchain);

    /// @notice Determine if resolving `name` requires offchain data.
    ///
    /// @param name The DNS-encoded name.
    ///
    /// @return `true` if requires offchain data.
    function requiresOffchain(bytes calldata name) external view returns (bool);
}
