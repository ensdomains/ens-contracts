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
library NameCoder {
    /// @dev The DNS-encoded name is malformed.
    error DNSDecodingFailed(bytes dns);

    /// @dev A label of the ENS name has an invalid size.
    error DNSEncodingFailed(string ens);

    /// @dev Same as `BytesUtils.readLabel()` but supports hashed labels.
    ///      Only the last labelHash is zero.
    ///      Disallows hashed label of zero (eg. `[0..0]`) to prevent confusion with terminator.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param idx The offset into `name` to start reading.
    /// @return labelHash The resulting labelhash.
    /// @return newIdx The offset into `name` of the next label.
    function readLabel(
        bytes memory name,
        uint256 idx
    ) internal pure returns (bytes32 labelHash, uint256 newIdx) {
        if (idx >= name.length) revert DNSDecodingFailed(name); // "readLabel: expected length"
        uint256 len = uint256(uint8(name[idx++]));
        newIdx = idx + len;
        if (newIdx > name.length) revert DNSDecodingFailed(name); // "readLabel: expected label"
        if (len == 66 && name[idx] == "[" && name[newIdx - 1] == "]") {
            bool valid;
            (labelHash, valid) = HexUtils.hexStringToBytes32(
                name,
                idx + 1,
                newIdx - 1
            ); // will not revert
            if (!valid || labelHash == bytes32(0)) {
                revert DNSDecodingFailed(name); // "readLabel: malformed" or null literal
            }
        } else if (len > 0) {
            assembly {
                labelHash := keccak256(add(add(name, idx), 32), len)
            }
        }
    }

    /// @dev Same as `BytesUtils.namehash()` but supports hashed labels.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param idx The offset into name start hashing.
    /// @return hash The resulting namehash.
    function namehash(
        bytes memory name,
        uint256 idx
    ) internal pure returns (bytes32 hash) {
        (hash, idx) = readLabel(name, idx);
        if (hash == bytes32(0)) {
            if (idx != name.length) revert DNSDecodingFailed(name); // "namehash: Junk at end of name"
        } else {
            bytes32 parent = namehash(name, idx);
            assembly {
                mstore(0, parent)
                mstore(32, hash)
                hash := keccak256(0, 64)
            }
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
}
