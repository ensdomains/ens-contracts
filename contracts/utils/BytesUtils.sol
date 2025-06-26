//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library BytesUtils {
    /// @dev `offset` was beyond `length`.
    ///       Error selector: `0x8a3c1cfb`
    error OffsetOutOfBoundsError(uint256 offset, uint256 length);

    /// @dev Assert `end` is not beyond the length of `v`.
    function _checkBound(bytes memory v, uint256 end) internal pure {
        if (end > v.length) {
            revert OffsetOutOfBoundsError(end, v.length);
        }
    }

    /// @dev Compute `keccak256(v[pos:pos+len])`.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @param len The number of bytes to hash.
    /// @return ret The corresponding hash.
    function keccak(
        bytes memory v,
        uint256 pos,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        _checkBound(v, pos + len);
        assembly {
            ret := keccak256(add(add(v, 32), pos), len)
        }
    }

    /// @dev Lexicographically compare two byte strings.
    /// @param vA The first bytes to compare.
    /// @param vB The second bytes to compare.
    /// @return A positive number if `A > B`, a negative number if `A < B`, or zero if `A == B`.
    function compare(
        bytes memory vA,
        bytes memory vB
    ) internal pure returns (int256) {
        return compare(vA, 0, vA.length, vB, 0, vB.length);
    }

    /// @dev Lexicographically compare two byte ranges: `A = vA[posA:posA+lenA]` and `B = vB[posB:posB+lenB]`.
    /// @param vA The first bytes.
    /// @param posA The offset of the first bytes.
    /// @param lenA The length of the first bytes.
    /// @param vB The second bytes.
    /// @param posB The offset of the second bytes.
    /// @param lenB The length of the second bytes.
    /// @return A positive number if `A > B`, a negative number if `A < B`, or zero if `A == B`.
    function compare(
        bytes memory vA,
        uint256 posA,
        uint256 lenA,
        bytes memory vB,
        uint256 posB,
        uint256 lenB
    ) internal pure returns (int256) {
        _checkBound(vA, posA + lenA);
        _checkBound(vB, posB + lenB);
        uint256 ptrA;
        uint256 ptrB;
        assembly {
            ptrA := add(vA, posA)
            ptrB := add(vB, posB)
        }
        uint256 shortest = lenA < lenB ? lenA : lenB;
        for (uint256 i; i < shortest; i += 32) {
            uint256 a;
            uint256 b;
            assembly {
                ptrA := add(ptrA, 32)
                ptrB := add(ptrB, 32)
                a := mload(ptrA)
                b := mload(ptrB)
            }
            if (a != b) {
                uint256 rest = shortest - i;
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
        }
        return int256(lenA) - int256(lenB);
    }

    /// @dev Determine if `a[posA:posA+len] == b[posB:posB+len]`.
    /// @param vA The first bytes.
    /// @param posA The offset into the first bytes.
    /// @param vB The second bytes.
    /// @param posB The offset into the second bytes.
    /// @param len The number of bytes to compare.
    /// @return True if the byte ranges are equal.
    function equals(
        bytes memory vA,
        uint256 posA,
        bytes memory vB,
        uint256 posB,
        uint256 len
    ) internal pure returns (bool) {
        return keccak(vA, posA, len) == keccak(vB, posB, len);
    }

    /// @dev Determeine if `a[posA:] == b[posB:]`.
    /// @param vA The first bytes.
    /// @param posA The offset into the first bytes.
    /// @param vB The second bytes.
    /// @param posB The offset into the second bytes.
    /// @return True if the byte ranges are equal.
    function equals(
        bytes memory vA,
        uint256 posA,
        bytes memory vB,
        uint256 posB
    ) internal pure returns (bool) {
        _checkBound(vA, posA);
        _checkBound(vB, posB);
        return
            keccak(vA, posA, vA.length - posA) ==
            keccak(vB, posB, vB.length - posB);
    }

    /// @dev Determeine if `a[posA:] == b`.
    /// @param vA The first bytes.
    /// @param posA The offset into the first bytes.
    /// @param vB The second bytes.
    /// @return True if the byte ranges are equal.
    function equals(
        bytes memory vA,
        uint256 posA,
        bytes memory vB
    ) internal pure returns (bool) {
        return
            vA.length == posA + vB.length && equals(vA, posA, vB, 0, vB.length);
    }

    /// @dev Determine if `a == b`.
    /// @param vA The first bytes.
    /// @param vB The second bytes.
    /// @return True if the bytes are equal.
    function equals(
        bytes memory vA,
        bytes memory vB
    ) internal pure returns (bool) {
        return vA.length == vB.length && keccak256(vA) == keccak256(vB);
    }

    /// @dev Returns `uint8(v[pos])`.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @return The corresponding `uint8`.
    function readUint8(
        bytes memory v,
        uint256 pos
    ) internal pure returns (uint8) {
        // _checkBound(v, pos + 1);
        return uint8(v[pos]);
    }

    /// @dev Returns `uint16(bytes2(v[pos:pos+2]))`.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @return ret The corresponding `uint16`.
    function readUint16(
        bytes memory v,
        uint256 pos
    ) internal pure returns (uint16 ret) {
        _checkBound(v, pos + 2);
        assembly {
            ret := shr(240, mload(add(add(v, 32), pos)))
        }
    }

    /// @dev Returns `uint32(bytes4(v[pos:pos+4]))`.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @return ret The corresponding `uint32`.
    function readUint32(
        bytes memory v,
        uint256 pos
    ) internal pure returns (uint32 ret) {
        _checkBound(v, pos + 4);
        assembly {
            ret := shr(224, mload(add(add(v, 32), pos)))
        }
    }

    /// @dev Returns `bytes20(v[pos:pos+20])`.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @return ret The corresponding `bytes20`.
    function readBytes20(
        bytes memory v,
        uint256 pos
    ) internal pure returns (bytes20 ret) {
        _checkBound(v, pos + 20);
        assembly {
            ret := shl(96, mload(add(add(v, 20), pos)))
        }
    }

    /// @dev Returns `bytes32(v[pos:pos+32])`.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @return ret The corresponding `bytes32`.
    function readBytes32(
        bytes memory v,
        uint256 pos
    ) internal pure returns (bytes32 ret) {
        _checkBound(v, pos + 32);
        assembly {
            ret := mload(add(add(v, 32), pos))
        }
    }

    /// @dev Returns `bytes32(bytesN(v[pos:pos+len]))`.
    ///      Accepts 0-32 bytes or reverts.
    /// @param v The source bytes.
    /// @param pos The offset into the source.
    /// @param len The number of bytes.
    /// @return ret The corresponding N-bytes left-aligned in a `bytes32`.
    function readBytesN(
        bytes memory v,
        uint256 pos,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        require(len <= 32);
        _checkBound(v, pos + len);
        assembly {
            let mask := sub(shl(shl(3, sub(32, len)), 1), 1) // <(32-N)x00><NxFF>
            ret := and(mload(add(add(v, 32), pos)), not(mask))
        }
    }

    /// @dev Copy `mem[src:src+len]` to `mem[dst:dst+len]`.
    /// @param src The source memory offset.
    /// @param dst The destination memory offset.
    /// @param len The number of bytes to copy.
    function unsafeMemcpy(uint256 dst, uint256 src, uint256 len) private pure {
        assembly {
            // Copy word-length chunks while possible
            // prettier-ignore
            for {} gt(len, 31) {} {
                mstore(dst, mload(src))
                dst := add(dst, 32)
                src := add(src, 32)
                len := sub(len, 32)
            }
            // Copy remaining bytes
            if len {
                let mask := sub(shl(shl(3, sub(32, len)), 1), 1) // see above
                let wSrc := and(mload(src), not(mask))
                let wDst := and(mload(dst), mask)
                mstore(dst, or(wSrc, wDst))
            }
        }
    }

    /// @dev Copy `vSrc[posSrc:posSrc+len]` to `vDst[posDst:posDst:len]`.
    /// @param vSrc The source bytes.
    /// @param posSrc The offset into the source to begin the copy.
    /// @param vDst The destination bytes.
    /// @param posDst The offset into the destination to place the copy.
    /// @param len The number of bytes to copy.
    function copyBytes(
        bytes memory vSrc,
        uint256 posSrc,
        bytes memory vDst,
        uint256 posDst,
        uint256 len
    ) internal pure {
        _checkBound(vSrc, posSrc + len);
        _checkBound(vDst, posDst + len);
        uint256 src;
        uint256 dst;
        assembly {
            src := add(add(vSrc, 32), posSrc)
            dst := add(add(vDst, 32), posDst)
        }
        unsafeMemcpy(dst, src, len);
    }

    /// @dev Copies a substring into a new byte string.
    /// @param vSrc The byte string to copy from.
    /// @param pos The offset to start copying at.
    /// @param len The number of bytes to copy.
    /// @return vDst The copied substring.
    function substring(
        bytes memory vSrc,
        uint256 pos,
        uint256 len
    ) internal pure returns (bytes memory vDst) {
        vDst = new bytes(len);
        copyBytes(vSrc, pos, vDst, 0, len);
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

    /// @dev Find the first occurrence of `needle`.
    /// @param v The bytes to search.
    /// @param pos The offset to start searching.
    /// @param len The number of bytes to search.
    /// @param needle The byte to search for.
    /// @return The offset of `needle`, or -1 if not found.
    function find(
        bytes memory v,
        uint256 pos,
        uint256 len,
        bytes1 needle
    ) internal pure returns (uint256) {
        for (uint256 end = pos + len; pos < end; pos++) {
            if (v[pos] == needle) {
                return pos;
            }
        }
        return type(uint256).max;
    }
}
