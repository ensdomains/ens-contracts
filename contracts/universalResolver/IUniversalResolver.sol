// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @notice Interface for the UniversalResolver.
interface IUniversalResolver {
    /// @notice A resolver could not be found for the supplied name.
    error ResolverNotFound(bytes name);

    /// @notice The resolved address from reverse resolution does not match the supplied address.
    error ReverseAddressMismatch(bytes result);

    /// @notice The resolver is not a contract.
    error ResolverNotContract(bytes name);

    /// @notice The resolver returned an error.
    error ResolverError(bytes returnData);

    /// @notice A HTTP error occurred on the batch gateway.
    error HttpError(uint16 status, string message);

    /// @notice Performs ENS name resolution for the supplied name and resolution data.
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
    /// @param lookupAddress The address to reverse resolve, in encoded form.
    /// @param coinType The coin type to use for the reverse resolution.
    ///                 For ETH, this is 60.
    ///                 For other EVM chains, coinType is calculated as `0x80000000 | chainId`.
    /// @return name The reverse resolution result.
    /// @return resolver The resolver that was used to resolve the name.
    /// @return reverseResolver The resolver that was used to resolve the reverse name.
    function reverse(
        bytes calldata lookupAddress,
        uint256 coinType
    )
        external
        view
        returns (string memory name, address resolver, address reverseResolver);
}
