pragma solidity >=0.8.4;

library BytesUtils {
    /*
     * @dev Returns the 96-bit number at the specified index of self.
     * @param self The byte string.
     * @param idx The index into the bytes
     * @return The specified 96 bits of the string, interpreted as an integer.
     */

    function readUint96(bytes memory self, uint256 idx)
        internal
        pure
        returns (uint96 ret)
    {
        require(idx + 12 <= self.length);
        assembly {
            ret := and(
                mload(add(add(self, 12), idx)),
                0xFFFFFFFFFFFFFFFFFFFFFFFF
            )
        }
    }

    /*
    * @dev Returns the keccak-256 hash of a byte range.
    * @param self The byte string to hash.
    * @param offset The position to start hashing at.
    * @param len The number of bytes to hash.
    * @return The hash of the byte range.
    */
    function keccak(bytes memory self, uint offset, uint len) internal pure returns (bytes32 ret) {
        require(offset + len <= self.length);
        assembly {
            ret := keccak256(add(add(self, 32), offset), len)
        }
    }
    
    /**
     * @dev Returns the keccak-256 hash of a DNS-encoded label, and the offset to the start of the next label.
     * @param self The byte string to read a label from.
     * @param idx The index to read a label at.
     * @return labelhash The hash of the label at the specified index.
     * @return newIdx The index of the start of the next label.
     */
    function readLabel(bytes memory self, uint256 idx) internal pure returns (bytes32 labelhash, uint newIdx) {
        uint len = uint(uint8(self[idx]));
        labelhash = keccak(self, idx + 1, len);
        newIdx = idx + len + 1;
    }

    function memcpy(uint dest, uint src, uint len) private pure {
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
            uint mask = (256 ** (32 - len)) - 1;
            assembly {
                let srcpart := and(mload(src), not(mask))
                let destpart := and(mload(dest), mask)
                mstore(dest, or(destpart, srcpart))
            }
        }
    }
    
    function memcpy(bytes memory dest, uint destoff, bytes memory src, uint srcoff, uint len) internal pure {
        assert(destoff + len <= dest.length);
        assert(srcoff + len <= src.length);

        uint destptr;
        uint srcptr;
        assembly {
            destptr := add(add(dest, 32), destoff)
            srcptr := add(add(src, 32), srcoff)
        }
        memcpy(destptr, srcptr, len);
    }
}
