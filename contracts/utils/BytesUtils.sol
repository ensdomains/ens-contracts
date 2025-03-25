//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library BytesUtils {
    error OffsetOutOfBoundsError(uint256 offset, uint256 length);

    /// @dev Returns the keccak-256 hash of a byte range.
    /// @param self The byte string to hash.
    /// @param offset The position to start hashing at.
    /// @param len The number of bytes to hash.
    /// @return ret The hash of the byte range.
    function keccak(
        bytes memory self,
        uint256 offset,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        require(offset + len <= self.length);
        assembly {
            ret := keccak256(add(add(self, 32), offset), len)
        }
    }

    /// @dev Returns the ENS namehash of a DNS-encoded name.
    /// @param self The DNS-encoded name to hash.
    /// @param offset The offset at which to start hashing.
    /// @return The namehash of the name.
    function namehash(
        bytes memory self,
        uint256 offset
    ) internal pure returns (bytes32) {
        (bytes32 labelhash, uint256 newOffset) = readLabel(self, offset);
        if (labelhash == bytes32(0)) {
            require(offset == self.length - 1, "namehash: Junk at end of name");
            return bytes32(0);
        }
        return
            keccak256(abi.encodePacked(namehash(self, newOffset), labelhash));
    }

    /// @dev Returns the keccak-256 hash of a DNS-encoded label, and the offset to the start of the next label.
    /// @param self The byte string to read a label from.
    /// @param idx The index to read a label at.
    /// @return labelhash The hash of the label at the specified index, or 0 if it is the last label.
    /// @return newIdx The index of the start of the next label.
    function readLabel(
        bytes memory self,
        uint256 idx
    ) internal pure returns (bytes32 labelhash, uint256 newIdx) {
        require(idx < self.length, "readLabel: Index out of bounds");
        uint256 len = uint256(uint8(self[idx]));
        if (len > 0) {
            labelhash = keccak(self, idx + 1, len);
        } else {
            labelhash = bytes32(0);
        }
        newIdx = idx + len + 1;
    }

    /// @dev Returns a positive number if `other` comes lexicographically after
    ///      `self`, a negative number if it comes before, or zero if the
    ///      contents of the two bytes are equal.
    /// @param self The first bytes to compare.
    /// @param other The second bytes to compare.
    /// @return The result of the comparison.
    function compare(
        bytes memory self,
        bytes memory other
    ) internal pure returns (int256) {
        return compare(self, 0, self.length, other, 0, other.length);
    }

    /// @dev Returns a positive number if `other` comes lexicographically after
    ///      `self`, a negative number if it comes before, or zero if the
    ///      contents of the two bytes are equal. Comparison is done per-rune,
    ///      on unicode codepoints.
    /// @param self The first bytes to compare.
    /// @param offset The offset of self.
    /// @param len    The length of self.
    /// @param other The second bytes to compare.
    /// @param otheroffset The offset of the other string.
    /// @param otherlen    The length of the other string.
    /// @return The result of the comparison.
    function compare(
        bytes memory self,
        uint256 offset,
        uint256 len,
        bytes memory other,
        uint256 otheroffset,
        uint256 otherlen
    ) internal pure returns (int256) {
        if (offset + len > self.length) {
            revert OffsetOutOfBoundsError(offset + len, self.length);
        }
        if (otheroffset + otherlen > other.length) {
            revert OffsetOutOfBoundsError(otheroffset + otherlen, other.length);
        }

        uint256 shortest = len;
        if (otherlen < len) shortest = otherlen;

        uint256 selfptr;
        uint256 otherptr;

        assembly {
            selfptr := add(self, add(offset, 32))
            otherptr := add(other, add(otheroffset, 32))
        }
        for (uint256 idx = 0; idx < shortest; idx += 32) {
            uint256 a;
            uint256 b;
            assembly {
                a := mload(selfptr)
                b := mload(otherptr)
            }
            if (a != b) {
                uint256 rest = shortest - idx;
                if (rest < 32) {
                    // shift out the irrelevant bits
                    rest = (32 - rest) << 3; // bits to drop
                    a >>= rest;
                    b >>= rest;
                }
                if (a < b) {
                    return -1;
                } else if (a > b) {
                    return 1;
                }
            }
            selfptr += 32;
            otherptr += 32;
        }

        return int256(len) - int256(otherlen);
    }

    /// @dev Returns true if the two byte ranges are equal.
    /// @param self The first byte range to compare.
    /// @param offset The offset into the first byte range.
    /// @param other The second byte range to compare.
    /// @param otherOffset The offset into the second byte range.
    /// @param len The number of bytes to compare
    /// @return True if the byte ranges are equal, false otherwise.
    function equals(
        bytes memory self,
        uint256 offset,
        bytes memory other,
        uint256 otherOffset,
        uint256 len
    ) internal pure returns (bool) {
        return keccak(self, offset, len) == keccak(other, otherOffset, len);
    }

    /// @dev Returns true if the two byte ranges are equal with offsets.
    /// @param self The first byte range to compare.
    /// @param offset The offset into the first byte range.
    /// @param other The second byte range to compare.
    /// @param otherOffset The offset into the second byte range.
    /// @return True if the byte ranges are equal, false otherwise.
    function equals(
        bytes memory self,
        uint256 offset,
        bytes memory other,
        uint256 otherOffset
    ) internal pure returns (bool) {
        return
            keccak(self, offset, self.length - offset) ==
            keccak(other, otherOffset, other.length - otherOffset);
    }

    /// @dev Compares a range of 'self' to all of 'other' and returns True iff
    ///      they are equal.
    /// @param self The first byte range to compare.
    /// @param offset The offset into the first byte range.
    /// @param other The second byte range to compare.
    /// @return True if the byte ranges are equal, false otherwise.
    function equals(
        bytes memory self,
        uint256 offset,
        bytes memory other
    ) internal pure returns (bool) {
        return
            self.length == offset + other.length &&
            equals(self, offset, other, 0, other.length);
    }

    /// @dev Returns true if the two byte ranges are equal.
    /// @param self The first byte range to compare.
    /// @param other The second byte range to compare.
    /// @return True if the byte ranges are equal, false otherwise.
    function equals(
        bytes memory self,
        bytes memory other
    ) internal pure returns (bool) {
        return
            self.length == other.length &&
            equals(self, 0, other, 0, self.length);
    }

    /// @dev Returns the 8-bit number at the specified index of self.
    /// @param self The byte string.
    /// @param idx The index into the bytes
    /// @return ret The specified 8 bits of the string, interpreted as an integer.
    function readUint8(
        bytes memory self,
        uint256 idx
    ) internal pure returns (uint8 ret) {
        return uint8(self[idx]);
    }

    /// @dev Returns the 16-bit number at the specified index of self.
    /// @param self The byte string.
    /// @param idx The index into the bytes
    /// @return ret The specified 16 bits of the string, interpreted as an integer.
    function readUint16(
        bytes memory self,
        uint256 idx
    ) internal pure returns (uint16 ret) {
        require(idx + 2 <= self.length);
        assembly {
            ret := and(mload(add(add(self, 2), idx)), 0xFFFF)
        }
    }

    /// @dev Returns the 32-bit number at the specified index of self.
    /// @param self The byte string.
    /// @param idx The index into the bytes
    /// @return ret The specified 32 bits of the string, interpreted as an integer.
    function readUint32(
        bytes memory self,
        uint256 idx
    ) internal pure returns (uint32 ret) {
        require(idx + 4 <= self.length);
        assembly {
            ret := and(mload(add(add(self, 4), idx)), 0xFFFFFFFF)
        }
    }

    /// @dev Returns the 32 byte value at the specified index of self.
    /// @param self The byte string.
    /// @param idx The index into the bytes
    /// @return ret The specified 32 bytes of the string.
    function readBytes32(
        bytes memory self,
        uint256 idx
    ) internal pure returns (bytes32 ret) {
        require(idx + 32 <= self.length);
        assembly {
            ret := mload(add(add(self, 32), idx))
        }
    }

    /// @dev Returns the 32 byte value at the specified index of self.
    /// @param self The byte string.
    /// @param idx The index into the bytes
    /// @return ret The specified 32 bytes of the string.
    function readBytes20(
        bytes memory self,
        uint256 idx
    ) internal pure returns (bytes20 ret) {
        require(idx + 20 <= self.length);
        assembly {
            ret := and(
                mload(add(add(self, 32), idx)),
                0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000000000000000000000
            )
        }
    }

    /// @dev Returns the n byte value at the specified index of self.
    /// @param self The byte string.
    /// @param idx The index into the bytes.
    /// @param len The number of bytes.
    /// @return ret The specified 32 bytes of the string.
    function readBytesN(
        bytes memory self,
        uint256 idx,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        require(len <= 32);
        require(idx + len <= self.length);
        assembly {
            let mask := not(sub(exp(256, sub(32, len)), 1))
            ret := and(mload(add(add(self, 32), idx)), mask)
        }
    }

    function memcpy(uint256 dest, uint256 src, uint256 len) private pure {
        // Copy word-length chunks while possible
        for (; len >= 32; len -= 32) {
            assembly {
                mstore(dest, mload(src))
            }
            dest += 32;
            src += 32;
        }

        // Copy remaining bytes
        unchecked {
            uint256 mask = (256 ** (32 - len)) - 1;
            assembly {
                let srcpart := and(mload(src), not(mask))
                let destpart := and(mload(dest), mask)
                mstore(dest, or(destpart, srcpart))
            }
        }
    }

    /// @dev Copies a substring into a new byte string.
    /// @param self The byte string to copy from.
    /// @param offset The offset to start copying at.
    /// @param len The number of bytes to copy.
    function substring(
        bytes memory self,
        uint256 offset,
        uint256 len
    ) internal pure returns (bytes memory) {
        require(offset + len <= self.length);

        bytes memory ret = new bytes(len);
        uint256 dest;
        uint256 src;

        assembly {
            dest := add(ret, 32)
            src := add(add(self, 32), offset)
        }
        memcpy(dest, src, len);

        return ret;
    }

    // Maps characters from 0x30 to 0x7A to their base32 values.
    // 0xFF represents invalid characters in that range.
    bytes constant base32HexTable =
        hex"00010203040506070809FFFFFFFFFFFFFF0A0B0C0D0E0F101112131415161718191A1B1C1D1E1FFFFFFFFFFFFFFFFFFFFF0A0B0C0D0E0F101112131415161718191A1B1C1D1E1F";

    /// @dev Decodes unpadded base32 data of up to one word in length.
    /// @param self The data to decode.
    /// @param off Offset into the string to start at.
    /// @param len Number of characters to decode.
    /// @return The decoded data, left aligned.
    function base32HexDecodeWord(
        bytes memory self,
        uint256 off,
        uint256 len
    ) internal pure returns (bytes32) {
        require(len <= 52);

        uint256 ret = 0;
        uint8 decoded;
        for (uint256 i = 0; i < len; i++) {
            bytes1 char = self[off + i];
            require(char >= 0x30 && char <= 0x7A);
            decoded = uint8(base32HexTable[uint256(uint8(char)) - 0x30]);
            require(decoded <= 0x20);
            if (i == len - 1) {
                break;
            }
            ret = (ret << 5) | decoded;
        }

        uint256 bitlen = len * 5;
        if (len % 8 == 0) {
            // Multiple of 8 characters, no padding
            ret = (ret << 5) | decoded;
        } else if (len % 8 == 2) {
            // Two extra characters - 1 byte
            ret = (ret << 3) | (decoded >> 2);
            bitlen -= 2;
        } else if (len % 8 == 4) {
            // Four extra characters - 2 bytes
            ret = (ret << 1) | (decoded >> 4);
            bitlen -= 4;
        } else if (len % 8 == 5) {
            // Five extra characters - 3 bytes
            ret = (ret << 4) | (decoded >> 1);
            bitlen -= 1;
        } else if (len % 8 == 7) {
            // Seven extra characters - 4 bytes
            ret = (ret << 2) | (decoded >> 3);
            bitlen -= 3;
        } else {
            revert();
        }

        return bytes32(ret << (256 - bitlen));
    }

    /// @dev Finds the first occurrence of the byte `needle` in `self`.
    /// @param self The string to search
    /// @param off The offset to start searching at
    /// @param len The number of bytes to search
    /// @param needle The byte to search for
    /// @return The offset of `needle` in `self`, or 2**256-1 if it was not found.
    function find(
        bytes memory self,
        uint256 off,
        uint256 len,
        bytes1 needle
    ) internal pure returns (uint256) {
        for (uint256 idx = off; idx < off + len; idx++) {
            if (self[idx] == needle) {
                return idx;
            }
        }
        return type(uint256).max;
    }
}
