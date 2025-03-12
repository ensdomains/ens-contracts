// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// source: https://github.com/unruggable-labs/CCIPReader.sol/

/*
MIT License

Copyright (c) 2025 Unruggable

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// https://eips.ethereum.org/EIPS/eip-3668
error OffchainLookup(
    address sender,
    string[] urls,
    bytes request,
    bytes4 callback,
    bytes carry
);

struct OffchainLookupTuple {
    address sender;
    string[] gateways;
    bytes request;
    bytes4 selector;
    bytes carry;
}

library EIP3668 {
    /// This function decodes an `OffchainLookup` error into the properties of an `OffchainLookupTuple`
    /// This is essentially a conversion from an error to a struct
    function decode(
        bytes memory v
    ) internal pure returns (OffchainLookupTuple memory x) {
        (x.sender, x.gateways, x.request, x.selector, x.carry) = abi.decode(
            drop(v, 4),
            (address, string[], bytes, bytes4, bytes)
        );
    }

    /// @dev Drop leading bytes
    function drop(
        bytes memory data,
        uint256 size
    ) internal pure returns (bytes memory dropped) {
        require(data.length >= size);
        dropped = abi.encodePacked(data); // make a copy
        assembly {
            mstore(add(dropped, size), sub(mload(dropped), size)) // subtract length
            dropped := add(dropped, size) // add offset
        }
    }
}
