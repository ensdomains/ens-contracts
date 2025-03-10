// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// source: https://github.com/unruggable-labs/unruggable-resolve/blob/main/contracts/DNSCoder.sol

/*
MIT License

Copyright (c) 2025 Unruggable

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import {HexUtils} from "../utils/HexUtils.sol";

// observations:
// - ens.length = dns.length - 2
// - ens is offset 1-byte with lengths replaced with "."
// - ens <=> dns mapping is injective (when there no long names)

/// @dev The DNS-encoded name is incorrectly encoded
error DNSDecodingFailed(bytes dns);

/// @dev The ENS name lacks a faithful
error DNSEncodingFailed(string ens);

library DNSCoder {
    /**
     * @param dns DNS-encoded name, eg. "3aaa2bb1c0"
     * @return ens ENS name, eg. "aaa.bb.c"
     * @notice reverts DNSDecodingFailed()
     */
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
                if (dst > 0) v[dst++] = ".";
                while (src < end) {
                    bytes1 x = dns[src++];
                    if (x == ".") revert DNSDecodingFailed(dns); // malicious label
                    v[dst++] = x;
                }
            }
            if (src != dns.length) revert DNSDecodingFailed(dns); // junk at end
            return string(v);
        }
    }

    function encode(
        string memory ens
    ) internal pure returns (bytes memory dns) {
        return encode(ens, false);
    }

    /**
     * @param ens ENS name, eg. "aaa.bb.c"
     * @param encryptLongNames Encrypt labels longer than 255
     * @return dns DNS-encoded name, eg. "3aaa2bb1c0"
     * @notice reverts DNSEncodingFailed()
     */
    function encode(
        string memory ens,
        bool encryptLongNames
    ) internal pure returns (bytes memory dns) {
        unchecked {
            uint256 n = bytes(ens).length;
            if (n == 0) return hex"00"; // root
            dns = new bytes(n + 2); // always 2-longer
            uint256 start;
            assembly {
                start := add(dns, 32)
            }
            uint256 end = start;
            for (uint256 i; i < n; i++) {
                bytes1 x = bytes(ens)[i];
                if (x == ".") {
                    start = _encodeLabel(start, end, encryptLongNames);
                    if (start == 0) revert DNSEncodingFailed(ens);
                    end = start;
                } else {
                    assembly {
                        end := add(end, 1)
                        mstore(end, x)
                    }
                }
            }
            start = _encodeLabel(start, end, encryptLongNames);
            if (start == 0) revert DNSEncodingFailed(ens);
            assembly {
                mstore8(start, 0) // terminal byte
                mstore(dns, sub(start, add(dns, 31))) // truncate length
            }
        }
    }

    function _encodeLabel(
        uint256 start,
        uint256 end,
        bool encryptLongNames
    ) internal pure returns (uint256 next) {
        uint256 size = end - start;
        if (size > 255) {
            if (encryptLongNames) {
                assembly {
                    mstore(0, keccak256(add(start, 1), size))
                }
                HexUtils.unsafeHex(0, start + 2, 64);
                assembly {
                    mstore8(start, 66)
                    mstore8(add(start, 1), 0x5B) // [
                    mstore8(add(start, 66), 0x5D) // ]
                }
                next = start + 67;
            }
        } else if (size > 0) {
            assembly {
                mstore8(start, size)
            }
            next = end + 1;
        }
    }
}
