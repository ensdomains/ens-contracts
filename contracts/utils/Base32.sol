//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library Base32 {
    /// @dev Decode Base32-encoded data.
    /// @param v The encoded data.
    /// @param pos The offset to begin decoding.
    /// @param len The length of the decoded data.
    /// @return valid True if the decode was successful.
    /// @return ret The decoded bytes.
    function tryDecode(
        bytes memory v,
        uint256 pos,
        uint256 len,
        function(bytes1) internal pure returns (uint8) fn
    ) internal pure returns (bool valid, bytes memory ret) {
        if (pos + len <= v.length) {
            uint256 ptr;
            assembly {
                ptr := add(add(v, 32), pos)
            }
            (valid, ret) = unsafeDecode(ptr, len, fn);
        }
    }

    /// @dev Decode arbitrary Base32-encoded memory.
    /// @param ptr The memory offset.
    /// @param len The number of bytes to decode.
    /// @param fn The byte to base conversion function.
    /// @return valid True if the decode was successful.
    /// @return ret The decoded bytes.
    function unsafeDecode(
        uint256 ptr,
        uint256 len,
        function(bytes1) internal pure returns (uint8) fn
    ) internal pure returns (bool valid, bytes memory ret) {
        unchecked {
            uint256 n = (len * 5) >> 3;
            bytes memory v = new bytes(n);
            bytes32 clip;
            uint256 ammo;
            uint256 bits;
            uint256 word;
            for (uint256 i; i < n; i++) {
                while (bits < 8) {
                    if (ammo == 0) {
                        ammo = 32;
                        assembly {
                            clip := mload(ptr)
                        }
                        ptr += ammo;
                    }
                    uint8 x = fn(bytes1(clip));
                    if (x == 32) return (false, "");
                    clip <<= 8;
                    ammo -= 1;
                    word = (word << 5) | x;
                    bits += 5;
                }
                v[i] = bytes1(uint8(word >> (bits -= 8)));
            }
            return (true, v);
        }
    }

    /// @dev Map RFC 4648-encoded byte to base 32.
    ///      https://www.rfc-editor.org/rfc/rfc4648.html
    ///      Alphabet: `abcdefghijklmnopqrstuvwxyz234567`.
    function RFC4648(bytes1 x) internal pure returns (uint8) {
        unchecked {
            if (x >= "a" && x <= "z") {
                return uint8(x) - 97;
            } else if (x >= "A" && x <= "Z") {
                return uint8(x) - 65;
            } else if (x >= "2" && x <= "7") {
                return uint8(x) - 24;
            } else {
                return 32; // invalid
            }
        }
    }

    /// @dev Map radix-encoded byte to base 32.
    ///      Alphabet: `0123456789abcdefghijklmnopqrstuv`.
    function RADIX(bytes1 x) internal pure returns (uint8) {
        if (x >= "a" && x <= "v") {
            return uint8(x) - 87;
        } else if (x >= "A" && x <= "V") {
            return uint8(x) - 55;
        } else if (x >= "0" && x <= "9") {
            return uint8(x) - 48;
        } else {
            return 32; // invalid
        }
    }
}
