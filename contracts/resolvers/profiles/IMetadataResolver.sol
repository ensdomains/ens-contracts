// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

/// @notice A resolver with an indexer.
///         https://docs.ens.domains/ensip/16
/// @dev Interface selector: `0x8a596ebe`
interface IMetadataResolver {
    /// @notice Get the indexer metadata for `name`.
    ///
    /// @param name The DNS-encoded name.
    ///
    function metadata(
        bytes calldata name
    )
        external
        view
        returns (
            string[] memory indexerURLs,
            uint256 chainId,
            address baseRegistry
        );
}
