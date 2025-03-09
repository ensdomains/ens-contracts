// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library HexUtils {
    /**
     * @dev Attempts to parse bytes32 from a hex string
     * @param str The string to parse
     * @param idx The offset to start parsing at
     * @param lastIdx The (exclusive) last index in `str` to consider. Use `str.length` to scan the whole string.
     */
    function hexStringToBytes32(
        bytes memory str,
        uint256 idx,
        uint256 lastIdx
    ) internal pure returns (bytes32, bool) {
        require(lastIdx - idx <= 64);
        (bytes memory r, bool valid) = hexToBytes(str, idx, lastIdx);
        if (!valid) {
            return (bytes32(0), false);
        }
        bytes32 ret;
        assembly {
            ret := shr(mul(4, sub(64, sub(lastIdx, idx))), mload(add(r, 32)))
        }
        return (ret, true);
    }

    function hexToBytes(
        bytes memory str,
        uint256 idx,
        uint256 lastIdx
    ) internal pure returns (bytes memory r, bool valid) {
        uint256 hexLength = lastIdx - idx;
        if (hexLength % 2 == 1) {
            revert("Invalid string length");
        }
        r = new bytes(hexLength / 2);
        valid = true;
        assembly {
            // check that the index to read to is not past the end of the string
            if gt(lastIdx, mload(str)) {
                revert(0, 0)
            }

            function getHex(c) -> ascii {
                // chars 48-57: 0-9
                if and(gt(c, 47), lt(c, 58)) {
                    ascii := sub(c, 48)
                    leave
                }
                // chars 65-70: A-F
                if and(gt(c, 64), lt(c, 71)) {
                    ascii := add(sub(c, 65), 10)
                    leave
                }
                // chars 97-102: a-f
                if and(gt(c, 96), lt(c, 103)) {
                    ascii := add(sub(c, 97), 10)
                    leave
                }
                // invalid char
                ascii := 0xff
            }

            let ptr := add(str, 32)
            for {
                let i := idx
            } lt(i, lastIdx) {
                i := add(i, 2)
            } {
                let byte1 := getHex(byte(0, mload(add(ptr, i))))
                let byte2 := getHex(byte(0, mload(add(ptr, add(i, 1)))))
                // if either byte is invalid, set invalid and break loop
                if or(eq(byte1, 0xff), eq(byte2, 0xff)) {
                    valid := false
                    break
                }
                let combined := or(shl(4, byte1), byte2)
                mstore8(add(add(r, 32), div(sub(i, idx), 2)), combined)
            }
        }
    }

    /**
     * @dev Attempts to parse an address from a hex string
     * @param str The string to parse
     * @param idx The offset to start parsing at
     * @param lastIdx The (exclusive) last index in `str` to consider. Use `str.length` to scan the whole string.
     */
    function hexToAddress(
        bytes memory str,
        uint256 idx,
        uint256 lastIdx
    ) internal pure returns (address, bool) {
        if (lastIdx - idx < 40) return (address(0x0), false);
        (bytes32 r, bool valid) = hexStringToBytes32(str, idx, lastIdx);
        return (address(uint160(uint256(r))), valid);
    }

    /**
     * @dev Converts an address to a hex string
     */
    function addressToHex(address addr) internal pure returns (string memory) {
        // return bytesToHex(abi.encodePacked(addr));
        assembly {
            mstore(0, addr)
        }
        return unsafeMemoryToHex(12, 20);
    }

    /**
     * @dev Converts an uint256 to a hex string without zero padding
     * @notice Special case: unpaddedUintToHex(0, true) = "0"
     */
    function unpaddedUintToHex(
        uint256 value,
        bool dropLeadingZeroNibble
    ) internal pure returns (string memory hexString) {
        assembly {
            mstore(0, value)
        }
        uint256 skip = 0;
        for (uint256 b = 128; b >= 8; b >>= 1) {
            if (value < (1 << b)) {
                skip += b >> 3;
            } else {
                value >>= b;
            }
        }
        hexString = unsafeMemoryToHex(skip, 32 - skip);
        if (dropLeadingZeroNibble && bytes(hexString)[0] == "0") {
            assembly {
                mstore(add(hexString, 1), sub(mload(hexString), 1)) // drop leading
                hexString := add(hexString, 1)
            }
        }
    }

    /**
     * @dev Converts a bytes to a hex string
     */
    function bytesToHex(bytes memory v) internal pure returns (string memory) {
        uint256 ptr;
        assembly {
            ptr := add(v, 32)
        }
        return unsafeMemoryToHex(ptr, v.length);
    }

    /**
     * @dev Converts arbitrary memory to a hex string
     * @param ptr Memory offset of first byte
     * @param size Number of bytes
     */
    function unsafeMemoryToHex(
        uint256 ptr,
        uint256 size
    ) internal pure returns (string memory) {
        size <<= 1; // convert to nibbles
        bytes memory v = new bytes(size);
        for (uint256 i; i < size; ptr += 32) {
            uint256 word;
            assembly {
                word := mload(ptr)
            }
            uint256 shift = 256;
            while (i < size && shift > 0) {
                v[i++] = _nibbleToHexChar(uint8((word >> (shift -= 4)) & 15));
            }
        }
        return string(v);
    }

    function _nibbleToHexChar(
        uint8 nibble
    ) internal pure returns (bytes1 hexChar) {
        // "0" => 0x30, ("a" - 10) => 0x57
        return bytes1(nibble < 10 ? nibble + 0x30 : nibble + 0x57);
    }
}
