// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "../utils/HexUtils.sol";

/// @dev Library for encoding/decoding names.
///
/// An ENS name is stop-separated labels, eg. "aaa.bb.c".
///
/// A DNS-encoded name is composed of byte length-prefixed labels with a terminator byte.
/// eg. "\x03aaa\x02bb\x01c\x00".
/// - maximum label length is 255 bytes.
/// - length = 0 is reserved for the terminator (root).
///
/// To encode a label larger than 255 bytes, use a hashed label.
/// A label of any length can be converted to a hashed label.
///
/// A hashed label is encoded as "[" + toHex(keccak256(label)) + "]".
/// eg. [af2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc] = "vitalik".
/// - always 66 bytes.
/// - matches: `/^\[[0-9a-f]{64}\]$/`.
///
/// w/o hashed labels: `dns.length == 2 + ens.length` and the mapping is injective.
///  w/ hashed labels: `dns.length == 2 + ens.split('.').map(x => x.utf8Length).sum(n => n > 255 ? 66 : n)`.
///
library NameCoder {
    /// @dev The DNS-encoded name is malformed.
    ///      Error selector: `0xba4adc23`
    error DNSDecodingFailed(bytes dns);

    /// @dev A label of the ENS name has an invalid size.
    ///      Error selector: `0x9a4c3e3b`
    error DNSEncodingFailed(string ens);

    /// @dev Read the `size` of the label at `offset`.
    ///      If `size = 0`, it must be the end of `name` (no junk at end).
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading.
    /// @return size The size of the label in bytes.
    /// @return nextOffset The offset into `name` of the next label.
    function nextLabel(
        bytes memory name,
        uint256 offset
    ) internal pure returns (uint8 size, uint256 nextOffset) {
        assembly {
            size := byte(0, mload(add(add(name, 32), offset))) // uint8(name[offset])
            nextOffset := add(offset, add(1, size)) // offset + 1 + size
        }
        if (size > 0 ? nextOffset >= name.length : nextOffset != name.length) {
            revert DNSDecodingFailed(name);
        }
    }

    /// @dev Find the offset of the label before `offset` in `name`.
    ///      * `prevOffset(name, 0)` reverts.
    ///      * `prevOffset(name, name.length + 1)` reverts.
    ///      * `prevOffset(name, name.length) = name.length - 1`.
    ///      * `prevOffset(name, name.length - 1) = <tld>`.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading backwards.
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

    /// @dev Compute the ENS labelhash of the label at `offset` and the offset for the next label.
    ///      Disallows hashed label of zero (eg. `[0..0]`) to prevent confusion with terminator.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param offset The offset into `name` to start reading.
    /// @param parseHashed If true, supports hashed labels.
    /// @return labelHash The resulting labelhash.
    /// @return nextOffset The offset into `name` of the next label.
    /// @return size The size of the label in bytes.
    /// @return wasHashed If true, the label was interpreted as a hashed label.
    function readLabel(
        bytes memory name,
        uint256 offset,
        bool parseHashed
    )
        internal
        pure
        returns (
            bytes32 labelHash,
            uint256 nextOffset,
            uint8 size,
            bool wasHashed
        )
    {
        (size, nextOffset) = nextLabel(name, offset);
        if (
            parseHashed &&
            size == 66 &&
            name[offset + 1] == "[" &&
            name[nextOffset - 1] == "]"
        ) {
            (labelHash, wasHashed) = HexUtils.hexStringToBytes32(
                name,
                offset + 2,
                nextOffset - 1
            ); // will not revert
            if (!wasHashed || labelHash == bytes32(0)) {
                revert DNSDecodingFailed(name); // "readLabel: malformed" or null literal
            }
        } else if (size > 0) {
            assembly {
                labelHash := keccak256(add(add(name, offset), 33), size)
            }
        }
    }

    /// @dev Same as `BytesUtils.namehash()` but supports hashed labels.
    function readLabel(
        bytes memory name,
        uint256 offset
    ) internal pure returns (bytes32 labelHash, uint256 nextOffset) {
        (labelHash, nextOffset, , ) = readLabel(name, offset, true);
    }

    /// @dev Compute the ENS namehash of `name[:offset]`.
    ///      Supports hashed labels.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param offset The offset into name start hashing.
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

    /// @dev Compute a child namehash from a parent namehash.
    /// @param parentNode The namehash of the parent.
    /// @param labelHash The labelhash of the child.
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
    ///      Reverts `DNSDecodingFailed`.
    /// @param dns The DNS-encoded name to convert, eg. `\x03aaa\x02bb\x01c\x00`.
    /// @return ens The equivalent ENS name, eg. `aaa.bb.c`.
    function decode(
        bytes memory dns
    ) internal pure returns (string memory ens) {
        unchecked {
            uint256 n = dns.length;
            if (n == 1 && dns[0] == 0) return ""; // only valid answer is root
            if (n < 3) revert DNSDecodingFailed(dns);
            bytes memory v = new bytes(n - 2); // always 2-shorter
            uint256 src;
            uint256 dst;
            while (src < n) {
                uint8 len = uint8(dns[src++]);
                if (len == 0) break;
                uint256 end = src + len;
                if (end > dns.length) revert DNSDecodingFailed(dns); // overflow
                if (dst > 0) v[dst++] = "."; // skip first stop
                while (src < end) {
                    bytes1 x = dns[src++]; // read byte
                    if (x == ".") revert DNSDecodingFailed(dns); // malicious label
                    v[dst++] = x; // write byte
                }
            }
            if (src != dns.length) revert DNSDecodingFailed(dns); // junk at end
            return string(v);
        }
    }

    /// @dev Convert ENS name to DNS-encoded name.
    ///      Hashes labels longer than 255 bytes.
    ///      Reverts `DNSEncodingFailed`.
    /// @param ens The ENS name to convert, eg. `aaa.bb.c`.
    /// @return dns The corresponding DNS-encoded name, eg. `\x03aaa\x02bb\x01c\x00`.
    function encode(
        string memory ens
    ) internal pure returns (bytes memory dns) {
        unchecked {
            uint256 n = bytes(ens).length;
            if (n == 0) return hex"00"; // root
            dns = new bytes(n + 2);
            uint256 start;
            assembly {
                start := add(dns, 32) // first byte of output
            }
            uint256 end = start; // remember position to write length
            for (uint256 i; i < n; i++) {
                bytes1 x = bytes(ens)[i]; // read byte
                if (x == ".") {
                    start = _createHashedLabel(start, end);
                    if (start == 0) revert DNSEncodingFailed(ens);
                    end = start; // jump to next position
                } else {
                    assembly {
                        end := add(end, 1) // increase length
                        mstore(end, x) // write byte
                    }
                }
            }
            start = _createHashedLabel(start, end);
            if (start == 0) revert DNSEncodingFailed(ens);
            assembly {
                mstore8(start, 0) // terminal byte
                mstore(dns, sub(start, add(dns, 31))) // truncate length
            }
        }
    }

    /// @dev Write the label length.
    ///      If longer than 255, writes a hashed label instead.
    /// @param start The memory offset of the length-prefixed label.
    /// @param end The memory offset at the end of the label.
    /// @return next The memory offset for the next label.
    ///              Returns 0 if label is empty (handled by caller).
    function _createHashedLabel(
        uint256 start,
        uint256 end
    ) internal pure returns (uint256 next) {
        uint256 size = end - start; // length of label
        if (size > 255) {
            assembly {
                mstore(0, keccak256(add(start, 1), size)) // compute hash of label
            }
            HexUtils.unsafeHex(0, start + 2, 64); // override label with hex(hash)
            assembly {
                mstore8(add(start, 1), 0x5B) // "["
                mstore8(add(start, 66), 0x5D) // "]"
            }
            size = 66;
        }
        if (size > 0) {
            assembly {
                mstore8(start, size) // update length
            }
            next = start + 1 + size; // advance
        }
    }

    /// @dev Find the offset of `name` that namehashes to `nodeSuffix`.
    /// @param name The name to search.
    /// @param nodeSuffix The node to match.
    /// @return matched True if `name` ends with the suffix.
    /// @return node The namehash of `name[offset:]`.
    /// @return prevOffset The offset into `name` of the label before the suffix, or `matchOffset` if no match or prior label.
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
}
