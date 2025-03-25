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

    /// @notice Performs ENS name resolution for the supplied name and resolution data.
    /// @notice Callers should enable EIP-3668.
    /// @param name The name to resolve, in normalised and DNS-encoded form.
    /// @param data The resolution data, as specified in ENSIP-10.
    ///             For a multicall, the data should be encoded as `(bytes[])`.
    /// @return result The result of the resolution.
    ///                For a multicall, the result is encoded as `(bytes[])`.
    /// @return resolver The resolver that was used to resolve the name.
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result, address resolver);

    /// @notice Performs ENS reverse resolution for the supplied address and coin type.
    /// @notice Callers should enable EIP-3668.
    /// @param lookupAddress The address to reverse resolve, in encoded form.
    /// @param coinType The coin type to use for the reverse resolution.
    ///                 For ETH, this is 60.
    ///                 For other EVM chains, coinType is calculated as `0x80000000 | chainId`.
    /// @return primary The reverse resolution result.
    /// @return resolver The resolver that was used to resolve the name.
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
