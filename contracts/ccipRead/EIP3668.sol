// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// https://eips.ethereum.org/EIPS/eip-3668
error OffchainLookup(
    address sender,
    string[] urls,
    bytes request,
    bytes4 callback,
    bytes carry
);

/// @dev Simple library for decoding OffchainLookup() data

/// Example usage:
/// ```solidity
/// bytes memory v = hex"...";
/// | if (bytes4(v) == OffchainLookup.selector) {
/// |    EIP3668.Params memory params = EIP3668.decodeWithSelector(v);
/// | }
/// ```

library EIP3668 {
    struct Params {
        address sender;
        string[] urls;
        bytes callData;
        bytes4 callbackFunction;
        bytes extraData;
    }

    /// @dev Decode an `OffchainLookup` error into a struct
    function decode(bytes memory v) internal pure returns (Params memory p) {
        (p.sender, p.urls, p.callData, p.callbackFunction, p.extraData) = abi
            .decode(v, (address, string[], bytes, bytes4, bytes));
    }

    /// @dev Same as `decode()` but ignores the selector (first 4 bytes)
    function decodeWithSelector(
        bytes memory v
    ) internal pure returns (Params memory) {
        return decode(dropLeadingBytes(v, 4));
    }
}

function dropLeadingBytes(
    bytes memory data,
    uint256 size
) pure returns (bytes memory dropped) {
    require(data.length >= size);
    dropped = abi.encodePacked(data); // make a copy
    assembly {
        mstore(add(dropped, size), sub(mload(dropped), size)) // subtract length
        dropped := add(dropped, size) // add offset
    }
}
