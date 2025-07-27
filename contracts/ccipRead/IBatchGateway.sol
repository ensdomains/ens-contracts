// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface for Batch Gateway Offchain Lookup Protocol.
///         https://docs.ens.domains/ensip/21/
/// @dev Interface selector: `0xa780bab6`
interface IBatchGateway {
    /// @notice An HTTP error occurred.
    /// @dev Error selector: `0x01800152`
    error HttpError(uint16 status, string message);

    /// @dev Information extracted from an `OffchainLookup` revert.
    struct Request {
        address sender;
        string[] urls;
        bytes data;
    }

    /// @notice Perform multiple `OffchainLookup` in parallel.
    ///         Callers should enable EIP-3668.
    /// @param requests The array of requests to lookup in parallel.
    /// @return failures The failure status of the corresponding request.
    /// @return responses The response or error data of the corresponding request.
    function query(
        Request[] memory requests
    ) external view returns (bool[] memory failures, bytes[] memory responses);
}
