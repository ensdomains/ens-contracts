// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev https://eips.ethereum.org/EIPS/eip-3668
/// Error selector: `0x556f1830`
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

/// @dev Simple library for decoding `OffchainLookup` error data.
/// Avoids "stack too deep" issues as the natural decoding consumes 5 variables.
library EIP3668 {
    /// @dev Struct with members matching `OffchainLookup`.
    struct Params {
        address sender;
        string[] urls;
        bytes callData;
        bytes4 callbackFunction;
        bytes extraData;
    }

    /// @dev Decode an `OffchainLookup` into a struct from the data after the error selector.
    function decode(bytes memory v) internal pure returns (Params memory p) {
        (p.sender, p.urls, p.callData, p.callbackFunction, p.extraData) = abi
            .decode(v, (address, string[], bytes, bytes4, bytes));
    }
}
