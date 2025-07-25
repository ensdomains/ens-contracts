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

    /// @dev Compute `keccak256(v[off:off+len])`.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @param len The number of bytes to hash.
    /// @return ret The corresponding hash.
    function keccak(
        bytes memory v,
        uint256 off,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        _checkBound(v, off + len);
        assembly {
            ret := keccak256(add(add(v, 32), off), len)
        }
    }

    /// @dev Lexicographically compare two byte strings.
    /// @param vA The first bytes to compare.
    /// @param vB The second bytes to compare.
    /// @return Positive number if `A > B`, negative number if `A < B`, or zero if `A == B`.
    function compare(
        bytes memory vA,
        bytes memory vB
    ) internal pure returns (int256) {
        return compare(vA, 0, vA.length, vB, 0, vB.length);
    }

    /// @dev Lexicographically compare two byte ranges: `A = vA[offA:offA+lenA]` and `B = vB[offB:offB+lenB]`.
    /// @param vA The first bytes.
    /// @param offA The offset of the first bytes.
    /// @param lenA The length of the first bytes.
    /// @param vB The second bytes.
    /// @param offB The offset of the second bytes.
    /// @param lenB The length of the second bytes.
    /// @return Positive number if `A > B`, negative number if `A < B`, or zero if `A == B`.
    function compare(
        bytes memory vA,
        uint256 offA,
        uint256 lenA,
        bytes memory vB,
        uint256 offB,
        uint256 lenB
    ) internal pure returns (int256) {
        _checkBound(vA, offA + lenA);
        _checkBound(vB, offB + lenB);
        uint256 ptrA;
        uint256 ptrB;
        assembly {
            ptrA := add(vA, offA)
            ptrB := add(vB, offB)
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
                    rest = (32 - rest) << 3; // bits to drop
                    a >>= rest; // shift out the
                    b >>= rest; // irrelevant bits
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

    /// @dev Determine if `a[offA:offA+len] == b[offB:offB+len]`.
    /// @param vA The first bytes.
    /// @param offA The offset into the first bytes.
    /// @param vB The second bytes.
    /// @param offB The offset into the second bytes.
    /// @param len The number of bytes to compare.
    /// @return True if the byte ranges are equal.
    function equals(
        bytes memory vA,
        uint256 offA,
        bytes memory vB,
        uint256 offB,
        uint256 len
    ) internal pure returns (bool) {
        return keccak(vA, offA, len) == keccak(vB, offB, len);
    }

    /// @dev Determine if `a[offA:] == b[offB:]`.
    /// @param vA The first bytes.
    /// @param offA The offset into the first bytes.
    /// @param vB The second bytes.
    /// @param offB The offset into the second bytes.
    /// @return True if the byte ranges are equal.
    function equals(
        bytes memory vA,
        uint256 offA,
        bytes memory vB,
        uint256 offB
    ) internal pure returns (bool) {
        _checkBound(vA, offA);
        _checkBound(vB, offB);
        return
            keccak(vA, offA, vA.length - offA) ==
            keccak(vB, offB, vB.length - offB);
    }

    /// @dev Determine if `a[offA:] == b`.
    /// @param vA The first bytes.
    /// @param offA The offset into the first bytes.
    /// @param vB The second bytes.
    /// @return True if the byte ranges are equal.
    function equals(
        bytes memory vA,
        uint256 offA,
        bytes memory vB
    ) internal pure returns (bool) {
        return
            vA.length == offA + vB.length &&
            keccak(vA, offA, vB.length) == keccak256(vB);
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

    /// @dev Returns `uint8(v[off])`.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @return The corresponding `uint8`.
    function readUint8(
        bytes memory v,
        uint256 off
    ) internal pure returns (uint8) {
        _checkBound(v, off + 1);
        return uint8(v[off]);
    }

    /// @dev Returns `uint16(bytes2(v[off:off+2]))`.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @return ret The corresponding `uint16`.
    function readUint16(
        bytes memory v,
        uint256 off
    ) internal pure returns (uint16 ret) {
        _checkBound(v, off + 2);
        assembly {
            ret := shr(240, mload(add(add(v, 32), off)))
        }
    }

    /// @dev Returns `uint32(bytes4(v[off:off+4]))`.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @return ret The corresponding `uint32`.
    function readUint32(
        bytes memory v,
        uint256 off
    ) internal pure returns (uint32 ret) {
        _checkBound(v, off + 4);
        assembly {
            ret := shr(224, mload(add(add(v, 32), off)))
        }
    }

    /// @dev Returns `bytes20(v[off:off+20])`.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @return ret The corresponding `bytes20`.
    function readBytes20(
        bytes memory v,
        uint256 off
    ) internal pure returns (bytes20 ret) {
        _checkBound(v, off + 20);
        assembly {
            ret := shl(96, mload(add(add(v, 20), off)))
        }
    }

    /// @dev Returns `bytes32(v[off:off+32])`.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @return ret The corresponding `bytes32`.
    function readBytes32(
        bytes memory v,
        uint256 off
    ) internal pure returns (bytes32 ret) {
        _checkBound(v, off + 32);
        assembly {
            ret := mload(add(add(v, 32), off))
        }
    }

    /// @dev Returns `bytes32(bytesN(v[off:off+len]))`.
    ///      Accepts 0-32 bytes or reverts.
    /// @param v The source bytes.
    /// @param off The offset into the source.
    /// @param len The number of bytes.
    /// @return ret The corresponding N-bytes left-aligned in a `bytes32`.
    function readBytesN(
        bytes memory v,
        uint256 off,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        assert(len <= 32);
        _checkBound(v, off + len);
        assembly {
            let mask := sub(shl(shl(3, sub(32, len)), 1), 1) // <(32-N)x00><NxFF>
            ret := and(mload(add(add(v, 32), off)), not(mask))
        }
    }

    /// @dev Copy `mem[src:src+len]` to `mem[dst:dst+len]`.
    /// @param src The source memory offset.
    /// @param dst The destination memory offset.
    /// @param len The number of bytes to copy.
    function unsafeMemcpy(uint256 dst, uint256 src, uint256 len) internal pure {
        assembly {
            // Copy word-length chunks while offsible
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

    /// @dev Copy `vSrc[offSrc:offSrc+len]` to `vDst[offDst:offDst:len]`.
    /// @param vSrc The source bytes.
    /// @param offSrc The offset into the source to begin the copy.
    /// @param vDst The destination bytes.
    /// @param offDst The offset into the destination to place the copy.
    /// @param len The number of bytes to copy.
    function copyBytes(
        bytes memory vSrc,
        uint256 offSrc,
        bytes memory vDst,
        uint256 offDst,
        uint256 len
    ) internal pure {
        _checkBound(vSrc, offSrc + len);
        _checkBound(vDst, offDst + len);
        uint256 src;
        uint256 dst;
        assembly {
            src := add(add(vSrc, 32), offSrc)
            dst := add(add(vDst, 32), offDst)
        }
        unsafeMemcpy(dst, src, len);
    }

    /// @dev Copies a substring into a new byte string.
    /// @param vSrc The byte string to copy from.
    /// @param off The offset to start copying at.
    /// @param len The number of bytes to copy.
    /// @return vDst The copied substring.
    function substring(
        bytes memory vSrc,
        uint256 off,
        uint256 len
    ) internal pure returns (bytes memory vDst) {
        vDst = new bytes(len);
        copyBytes(vSrc, off, vDst, 0, len);
    }

    /// @dev Find the first occurrence of `needle`.
    /// @param v The bytes to search.
    /// @param off The offset to start searching.
    /// @param len The number of bytes to search.
    /// @param needle The byte to search for.
    /// @return The offset of `needle`, or `type(uint256).max` if not found.
    function find(
        bytes memory v,
        uint256 off,
        uint256 len,
        bytes1 needle
    ) internal pure returns (uint256) {
        for (uint256 end = off + len; off < end; off++) {
            if (v[off] == needle) {
                return off;
            }
        }
        return type(uint256).max;
    }
}
