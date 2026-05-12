// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface for the UniversalResolver.
/// @dev Interface selector: `0xcd191b34`
interface IUniversalResolver {
    /// @notice A resolver could not be found for the supplied name.
    /// @dev Error selector: `0x77209fe8`
    error ResolverNotFound(bytes name);

    /// @notice The resolver is not a contract.
    /// @dev Error selector: `0x1e9535f2`
    error ResolverNotContract(bytes name, address resolver);

    /// @notice The resolver did not respond.
    /// @dev Error selector: `0x7b1c461b`
    error UnsupportedResolverProfile(bytes4 selector);

    /// @notice The resolver returned an error.
    /// @dev Error selector: `0x95c0c752`
    error ResolverError(bytes errorData);

    /// @notice The resolved address from reverse resolution does not match the supplied address.
    /// @dev Error selector: `0xef9c03ce`
    error ReverseAddressMismatch(string primary, bytes primaryAddress);

    /// @notice An HTTP error occurred on a resolving gateway.
    /// @dev Error selector: `0x01800152`
    error HttpError(uint16 status, string message);

    /// @notice Find the resolver address for `name`.
    ///         Does not perform any validity checks on the resolver.
    /// @param name The name to search.
    /// @return resolver The found resolver, or null if not found.
    /// @return node The namehash of `name`.
    /// @return resolverOffset The offset into `name` corresponding to `resolver`.
    function findResolver(
        bytes memory name
    )
        external
        view
        returns (address resolver, bytes32 node, uint256 resolverOffset);

    /// @notice Performs ENS forward resolution for the supplied name and data.
    ///         Caller should enable EIP-3668.
    /// @param name The DNS-encoded name to resolve.
    /// @param data The ABI-encoded resolver calldata.
    ///             For a multicall, encode as `multicall(bytes[])`.
    /// @return result The ABI-encoded response for the calldata.
    ///                For a multicall, the results are encoded as `(bytes[])`.
    /// @return resolver The resolver that was used to resolve the name.
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result, address resolver);

    /// @notice Performs ENS primary name resolution for the supplied address and coin type, as specified in ENSIP-19.
    ///         Caller should enable EIP-3668.
    /// @param lookupAddress The byte-encoded address to resolve.
    /// @param coinType The coin type of the address to resolve.
    /// @return primary The verified primary name, or null if not set.
    /// @return resolver The resolver that was used to resolve the primary name.
    /// @return reverseResolver The resolver that was used to resolve the reverse name.
    function reverse(
        bytes calldata lookupAddress,
        uint256 coinType
    )
        external
        view
        returns (
            string memory primary,
            address resolver,
            address reverseResolver
        );
}
