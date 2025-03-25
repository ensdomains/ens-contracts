// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library HexUtils {
    /// @dev Attempts to parse bytes32 from a hex string
    /// @param str The string to parse
    /// @param idx The offset to start parsing at
    /// @param lastIdx The (exclusive) last index in `str` to consider. Use `str.length` to scan the whole string.
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

    /// @dev Attempts to parse an address from a hex string
    /// @param str The string to parse
    /// @param idx The offset to start parsing at
    /// @param lastIdx The (exclusive) last index in `str` to consider. Use `str.length` to scan the whole string.
    function hexToAddress(
        bytes memory str,
        uint256 idx,
        uint256 lastIdx
    ) internal pure returns (address, bool) {
        if (lastIdx - idx < 40) return (address(0x0), false);
        (bytes32 r, bool valid) = hexStringToBytes32(str, idx, lastIdx);
        return (address(uint160(uint256(r))), valid);
    }

    /// @dev Format an address as a hex string.
    /// @param addr The address to format.
    /// @return hexString The corresponding hex string w/o a 0x-prefix.
    function addressToHex(
        address addr
    ) internal pure returns (string memory hexString) {
        // return bytesToHex(abi.encodePacked(addr));
        hexString = new string(40);
        uint256 dst;
        assembly {
            mstore(0, addr)
            dst := add(hexString, 32)
        }
        unsafeHex(12, dst, 40);
    }

    /// @dev Format an integer as a variable-length hex string without zero padding.
    /// * unpaddedUintToHex(0, true)  = "0"
    /// * unpaddedUintToHex(1, true)  = "1"
    /// * unpaddedUintToHex(0, false) = "00"
    /// * unpaddedUintToHex(1, false) = "01"
    /// @param value The number to format.
    /// @param dropZeroNibble If true, the leading byte will use one nibble if less than 16.
    /// @return hexString The corresponding hex string w/o a 0x-prefix.
    function unpaddedUintToHex(
        uint256 value,
        bool dropZeroNibble
    ) internal pure returns (string memory hexString) {
        uint256 temp = value;
        uint256 shift;
        for (uint256 b = 128; b >= 8; b >>= 1) {
            if (temp < (1 << b)) {
                shift += b; // number of zero upper bits
            } else {
                temp >>= b; // shift away lower half
            }
        }
        if (dropZeroNibble && temp < 16) shift += 4;
        uint256 nibbles = 64 - (shift >> 2);
        hexString = new string(nibbles);
        uint256 dst;
        assembly {
            mstore(0, shl(shift, value)) // left-align
            dst := add(hexString, 32)
        }
        unsafeHex(0, dst, nibbles);
    }

    /// @dev Format bytes as a hex string.
    /// @param v The bytes to format.
    /// @return hexString The corresponding hex string w/o a 0x-prefix.
    function bytesToHex(
        bytes memory v
    ) internal pure returns (string memory hexString) {
        uint256 nibbles = v.length << 1;
        hexString = new string(nibbles);
        uint256 src;
        uint256 dst;
        assembly {
            src := add(v, 32)
            dst := add(hexString, 32)
        }
        unsafeHex(src, dst, nibbles);
    }

    /// @dev Converts arbitrary memory to a hex string.
    /// @param src The memory offset of first nibble of input.
    /// @param dst The memory offset of first hex-char of output.
    /// @param nibbles The number of nibbles to convert and the byte-length of the output.
    function unsafeHex(
        uint256 src,
        uint256 dst,
        uint256 nibbles
    ) internal pure {
        unchecked {
            for (uint256 end = dst + nibbles; dst < end; src += 32) {
                uint256 word;
                assembly {
                    word := mload(src)
                }
                for (uint256 shift = 256; dst < end && shift > 0; dst++) {
                    uint256 b = (word >> (shift -= 4)) & 15; // each nibble
                    b = b < 10 ? b + 0x30 : b + 0x57; // ("a" - 10) => 0x57
                    assembly {
                        mstore8(dst, b)
                    }
                }
            }
        }
    }
}
