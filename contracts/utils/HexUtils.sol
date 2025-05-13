// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library HexUtils {
    /// @dev Convert `hexString[pos:end]` to `bytes32`.
    ///      Accepts 0-64 hex-chars.
    ///      Uses right alignment: `1` &rarr; `0000000000000000000000000000000000000000000000000000000000000001`.
    /// @param hexString The string to parse.
    /// @param pos The index to start parsing.
    /// @param end The (exclusive) index to stop parsing.
    /// @return word The parsed bytes32.
    /// @return valid True if the parse was successful.
    function hexStringToBytes32(
        bytes memory hexString,
        uint256 pos,
        uint256 end
    ) internal pure returns (bytes32 word, bool valid) {
        uint256 nibbles = end - pos;
        if (nibbles > 64 || end > hexString.length) {
            return (bytes32(0), false); // too large or out of bounds
        }
        uint256 src;
        assembly {
            src := add(add(hexString, 32), pos)
        }
        valid = unsafeBytes(src, 0, nibbles);
        assembly {
            let pad := sub(32, shr(1, add(nibbles, 1))) // number of bytes
            word := shr(shl(3, pad), mload(0)) // right align
        }
    }

    /// @dev Convert `hexString[pos:end]` to `address`.
    ///      Accepts exactly 40 hex-chars.
    /// @param hexString The string to parse.
    /// @param pos The index to start parsing.
    /// @param end The (exclusive) index to stop parsing.
    /// @return addr The parsed address.
    /// @return valid True if the parse was successful.
    function hexToAddress(
        bytes memory hexString,
        uint256 pos,
        uint256 end
    ) internal pure returns (address addr, bool valid) {
        if (end - pos != 40) return (address(0), false); // wrong length
        bytes32 word;
        (word, valid) = hexStringToBytes32(hexString, pos, end);
        addr = address(uint160(uint256(word)));
    }

    /// @dev Convert `hexString[pos:end]` to `bytes`.
    ///      Accepts 0+ hex-chars.
    /// @param pos The index to start parsing.
    /// @param end The (exclusive) index to stop parsing.
    /// @return v The parsed bytes.
    /// @return valid True if the parse was successful.
    function hexToBytes(
        bytes memory hexString,
        uint256 pos,
        uint256 end
    ) internal pure returns (bytes memory v, bool valid) {
        uint256 nibbles = end - pos;
        v = new bytes((1 + nibbles) >> 1); // round up
        uint256 src;
        uint256 dst;
        assembly {
            src := add(add(hexString, 32), pos)
            dst := add(v, 32)
        }
        valid = unsafeBytes(src, dst, nibbles);
    }

    /// @dev Convert arbitrary hex-encoded memory to bytes.
    ///      If nibbles is odd, leading hex-char is padded, eg. `F` &rarr; `0x0F`.
    ///      Matches: /^[0-9a-f]*$/i.
    /// @param src The memory offset of first hex-char of input.
    /// @param dst The memory offset of first byte of output (cannot alias `src`).
    /// @param nibbles The number of hex-chars to convert.
    /// @return valid True if all characters were hex.
    function unsafeBytes(
        uint256 src,
        uint256 dst,
        uint256 nibbles
    ) internal pure returns (bool valid) {
        assembly {
            function getHex(c, i) -> ascii {
                c := byte(i, c)
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
                ascii := 0x100
            }
            valid := true
            let end := add(src, nibbles)
            if and(nibbles, 1) {
                let b := getHex(mload(src), 0) // "f" -> 15
                mstore8(dst, b) // write ascii byte
                src := add(src, 1) // update pointers
                dst := add(dst, 1)
                if gt(b, 255) {
                    valid := false
                    src := end // terminate loop
                }
            }
            for {

            } lt(src, end) {
                src := add(src, 2) // 2 nibbles
                dst := add(dst, 1) // per byte
            } {
                let word := mload(src) // read word (left aligned)
                let b := or(shl(4, getHex(word, 0)), getHex(word, 1)) // "ff" -> 255
                if gt(b, 255) {
                    valid := false
                    break
                }
                mstore8(dst, b) // write ascii byte
            }
        }
    }

    /// @dev Format `address` as a hex string.
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

    /// @dev Format `uint256` as a variable-length hex string without zero padding.
    /// * unpaddedUintToHex(0, true)  = "0"
    /// * unpaddedUintToHex(1, true)  = "1"
    /// * unpaddedUintToHex(0, false) = "00"
    /// * unpaddedUintToHex(1, false) = "01"
    /// @param value The number to format.
    /// @param dropZeroNibble If true, the leading byte will use one nibble if less than 16.
    /// @return hexString The corresponding hex string w/o an 0x-prefix.
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

    /// @dev Format `bytes` as a hex string.
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
    /// @param dst The memory offset of first hex-char of output (can alias `src`).
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
