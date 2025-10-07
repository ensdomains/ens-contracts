// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {LibMem} from "./LibMem/LibMem.sol";
import {BytesUtils} from "./BytesUtils.sol";

/// @dev Library for encoding/decoding names.
///
/// An ENS name is stop-separated labels, eg. "aaa.bb.c".
///
/// A DNS-encoded name is composed of byte length-prefixed labels with a terminator byte.
/// eg. "\x03aaa\x02bb\x01c\x00".
///
/// * maximum label length is 255 bytes.
/// * length = 0 is reserved for the terminator (root).
/// * `dns.length == 2 + ens.length` and the mapping is injective.
///
library NameCoder {
    /// @dev The namehash of "eth".
    bytes32 public constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    /// @dev The label was empty.
    ///      Error selector: `0xbf9a2740`
    error LabelIsEmpty();

    /// @dev The label was more than 255 bytes.
    ///      Error selector: `0xdab6c73c`
    error LabelIsTooLong(string label);

    /// @dev The DNS-encoded name is malformed.
    ///      Error selector: `0xba4adc23`
    error DNSDecodingFailed(bytes dns);

    /// @dev A label of the ENS name has an invalid size.
    ///      Error selector: `0x9a4c3e3b`
    error DNSEncodingFailed(string ens);

    /// @dev The `name` did not end with `suffix`.
    ///
    /// @param name The DNS-encoded name.
    /// @param suffix The DNS-encoded suffix.
    error NoSuffixMatch(bytes name, bytes suffix);

    /// @dev Read the `size` of the label at `offset`.
    ///      If `size = 0`, it must be the end of `name` (no junk at end).
    ///      Reverts `DNSDecodingFailed`.
    ///
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading.
    ///
    /// @return size The size of the label in bytes.
    /// @return nextOffset The offset into `name` of the next label.
    function nextLabel(
        bytes memory name,
        uint256 offset
    ) internal pure returns (uint8 size, uint256 nextOffset) {
        unchecked {
            if (offset >= name.length) {
                revert DNSDecodingFailed(name);
            }
            size = uint8(name[offset]);
            ++offset;
            if ((size == 0) != (offset == name.length)) {
                revert DNSDecodingFailed(name);
            }
            nextOffset = offset + size;
        }
    }

    /// @dev Find the offset of the label before `offset` in `name`.
    ///      * `prevOffset(name, 0)` reverts
    ///      * `prevOffset(name, name.length + 1)` reverts
    ///      * `prevOffset(name, name.length) = name.length - 1`
    ///      * `prevOffset(name, name.length - 1) = <tld>`
    ///      Reverts `DNSDecodingFailed`.
    ///
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading backwards.
    ///
    /// @return prevOffset The offset into `name` of the previous label.
    function prevLabel(
        bytes memory name,
        uint256 offset
    ) internal pure returns (uint256 prevOffset) {
        while (true) {
            (, uint256 nextOffset) = nextLabel(name, prevOffset);
            if (nextOffset == offset) break;
            if (nextOffset > offset) {
                revert DNSDecodingFailed(name);
            }
            prevOffset = nextOffset;
        }
    }

    /// @dev Count number of labels in `name`.
    ///      * `countLabels("\x03eth\x00") = 1`
    ///      * `countLabels("\x00") = 0`
    ///      Reverts like `nextLabel()`.
    ///
    /// @param name The DNS-encoded parent name.
    /// @param offset The offset into `name` to start hashing.
    ///
    /// @return count The number of labels.
    function countLabels(
        bytes memory name,
        uint256 offset
    ) internal pure returns (uint256 count) {
        uint8 size;
        while (true) {
            (size, offset) = nextLabel(name, offset);
            if (size == 0) break;
            ++count;
        }
    }

    /// @dev Compute the ENS labelhash of the label at `offset` and the offset for the next label.
    ///      Reverts `DNSDecodingFailed`.
    ///
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading.
    ///
    /// @return labelHash The resulting labelhash.
    /// @return nextOffset The offset into `name` of the next label.
    function readLabel(
        bytes memory name,
        uint256 offset
    ) internal pure returns (bytes32 labelHash, uint256 nextOffset) {
        uint8 size;
        (size, nextOffset) = nextLabel(name, offset);
        if (size > 0) {
            assembly {
                labelHash := keccak256(add(add(name, offset), 33), size)
            }
        }
    }

    /// @dev Read label at offset from a DNS-encoded name and the offset for the next label.
    ///      * `readLabel("\x03abc\x00", 0) = ("abc", 4)`
    ///      * `readLabel("\x00", 0) = ("", 1)`
    ///      Reverts `DNSDecodingFailed`.
    ///
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading.
    ///
    /// @return label The label corresponding to `offset`.
    /// @return nextOffset The offset into `name` of the next label.
    function extractLabel(
        bytes memory name,
        uint256 offset
    ) internal pure returns (string memory label, uint256 nextOffset) {
        uint8 size;
        (size, nextOffset) = nextLabel(name, offset);
        bytes memory v = new bytes(size);
        unchecked {
            LibMem.copy(LibMem.ptr(v), LibMem.ptr(name) + offset + 1, size);
        }
        label = string(v);
    }

    /// @dev Reads first label from a DNS-encoded name.
    ///      Reverts `DNSDecodingFailed`.
    ///      Reverts `LabelIsEmpty` if the label was empty.
    ///
    /// @param name The DNS-encoded name.
    ///
    /// @return The first label.
    function firstLabel(
        bytes memory name
    ) internal pure returns (string memory) {
        (string memory label, ) = extractLabel(name, 0);
        if (bytes(label).length == 0) {
            revert LabelIsEmpty();
        }
        return label;
    }

    /// @dev Compute the namehash of `name[:offset]`.
    ///      Reverts `DNSDecodingFailed`.
    ///
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start hashing.
    ///
    /// @return hash The namehash of `name[:offset]`.
    function namehash(
        bytes memory name,
        uint256 offset
    ) internal pure returns (bytes32 hash) {
        (hash, offset) = readLabel(name, offset);
        if (hash != bytes32(0)) {
            hash = namehash(namehash(name, offset), hash);
        }
    }

    /// @dev Compute a child namehash from a parent namehash and child labelhash.
    ///
    /// @param parentNode The namehash of the parent.
    /// @param labelHash The labelhash of the child.
    ///
    /// @return node The namehash of the child.
    function namehash(
        bytes32 parentNode,
        bytes32 labelHash
    ) internal pure returns (bytes32 node) {
        // ~100 gas less than: keccak256(abi.encode(parentNode, labelHash))
        assembly {
            mstore(0, parentNode)
            mstore(32, labelHash)
            node := keccak256(0, 64)
        }
    }

    /// @dev Convert DNS-encoded name to ENS name.
    ///      * `decode("\x00") = ""`
    ///      * `decode("\x03eth\x00") = "eth"`
    ///      * `decode("\x03aaa\x02bb\x01c\x00") = "aa.bb.c"`
    ///      * `decode("\x03a.b\x00")` reverts
    ///      Reverts like `nextLabel()`.
    ///
    /// @param dns The DNS-encoded name to convert.
    ///
    /// @return ens The equivalent ENS name.
    function decode(
        bytes memory dns
    ) internal pure returns (string memory ens) {
        unchecked {
            uint256 n = dns.length;
            if (n == 1 && dns[0] == 0) return ""; // only valid answer is root
            if (n < 3) revert DNSDecodingFailed(dns);
            bytes memory v = new bytes(n - 2); // always 2-shorter
            LibMem.copy(LibMem.ptr(v), LibMem.ptr(dns) + 1, n - 2); // shift by -1 byte
            uint256 offset;
            while (true) {
                (uint8 size, uint256 nextOffset) = nextLabel(dns, offset);
                if (size == 0) break;
                if (BytesUtils.includes(v, offset, size, ".")) {
                    revert DNSDecodingFailed(dns); // malicious label
                }
                if (offset > 0) {
                    v[offset - 1] = ".";
                }
                offset = nextOffset;
            }
            return string(v);
        }
    }

    /// @dev Convert ENS name to DNS-encoded name.
    ///      * `encode("aaa.bb.c") = "\x03aaa\x02bb\x01c\x00"`
    ///      * `encode("eth") = "\x03eth\x00"`
    ///      * `encode("") = "\x00"`
    ///      Reverts `DNSEncodingFailed`.
    ///
    /// @param ens The ENS name to convert.
    ///
    /// @return dns The corresponding DNS-encoded name, eg. `\x03aaa\x02bb\x01c\x00`.
    function encode(
        string memory ens
    ) internal pure returns (bytes memory dns) {
        unchecked {
            uint256 n = bytes(ens).length;
            if (n == 0) return hex"00"; // root
            dns = new bytes(n + 2); // always 2-longer
            LibMem.copy(LibMem.ptr(dns) + 1, LibMem.ptr(bytes(ens)), n); // shift by +1 byte
            uint256 start; // remember position to write length
            uint256 size;
            for (uint256 i; i < n; ++i) {
                if (bytes(ens)[i] == ".") {
                    size = i - start;
                    if (size == 0 || size > 255) {
                        revert DNSEncodingFailed(ens);
                    }
                    dns[start] = bytes1(uint8(size));
                    start = i + 1;
                }
            }
            size = n - start;
            if (size == 0 || size > 255) {
                revert DNSEncodingFailed(ens);
            }
            dns[start] = bytes1(uint8(size));
        }
    }

    /// @dev Find the offset into `name` that namehashes to `nodeSuffix`.
    ///
    /// @param name The DNS-encoded name to search.
    /// @param nodeSuffix The namehash to match.
    ///
    /// @return matched True if `name` ends with `nodeSuffix`.
    /// @return node The namehash of `name[offset:]`.
    /// @return prevOffset The offset into `name` of the label before `nodeSuffix`, or `matchOffset` if no match or no prior label.
    /// @return matchOffset The offset into `name` that namehashes to the `nodeSuffix`, or 0 if no match.
    function matchSuffix(
        bytes memory name,
        uint256 offset,
        bytes32 nodeSuffix
    )
        internal
        pure
        returns (
            bool matched,
            bytes32 node,
            uint256 prevOffset,
            uint256 matchOffset
        )
    {
        (bytes32 labelHash, uint256 next) = readLabel(name, offset);
        if (labelHash != bytes32(0)) {
            (matched, node, prevOffset, matchOffset) = matchSuffix(
                name,
                next,
                nodeSuffix
            );
            if (node == nodeSuffix) {
                matched = true;
                prevOffset = offset;
                matchOffset = next;
            }
            node = namehash(node, labelHash);
        }
        if (node == nodeSuffix) {
            matched = true;
            prevOffset = matchOffset = offset;
        }
    }

    /// @dev Assert `label` is an encodable size.
    ///
    /// @param label The label to check.
    ///
    /// @return The size of the label.
    function assertLabelSize(
        string memory label
    ) internal pure returns (uint8) {
        uint256 n = bytes(label).length;
        if (n == 0) revert LabelIsEmpty();
        if (n > 255) revert LabelIsTooLong(label);
        return uint8(n);
    }

    /// @dev Prepend `label` to DNS-encoded `name`.
    ///      * `addLabel("\x03eth\x00", "test") = "\x04test\x03eth\x00"`
    ///      * `addLabel("\x00", "eth") = "\x03eth\x00"`
    ///      * `addLabel("", "abc") = "\x03abc"` invalid
    ///      * `addLabel("", "")` reverts
    ///      Assumes `name` is properly encoded.
    ///      Reverts like `assertLabelSize()`.
    ///
    /// @param name The DNS-encoded parent name.
    /// @param label The child label to prepend.
    ///
    /// @return The DNS-encoded child name.
    function addLabel(
        bytes memory name,
        string memory label
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(assertLabelSize(label), label, name);
    }

    /// @dev Transform `label` to DNS-encoded `{label}.eth`.
    ///      * `ethName("eth") = "\x04test\x03eth\x00"`
    ///      Behaves like `addLabel()`.
    ///
    /// @param label The label to encode.
    ///
    /// @return The DNS-encoded name.
    function ethName(string memory label) internal pure returns (bytes memory) {
        return addLabel("\x03eth\x00", label);
    }
}
