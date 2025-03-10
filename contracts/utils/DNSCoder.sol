// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// inspired from: https://github.com/unruggable-labs/unruggable-resolve/blob/main/contracts/DNSCoder.sol

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

// observations:
// - ens.length = dns.length - 2
// - ens is offset 1-byte with lengths replaced with "."
// - ens <=> dns mapping is injective

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
            uint256 src = 0;
            uint256 dst = 0;
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

    /**
     * @param ens ENS name, eg. "aaa.bb.c"
     * @return dns DNS-encoded name, eg. "3aaa2bb1c0"
     * @notice reverts DNSEncodingFailed()
     * @notice  NameEncoder.dnsEncodeName()
     */
    function encode(
        string memory ens
    ) internal pure returns (bytes memory dns) {
        unchecked {
            uint256 n = bytes(ens).length;
            if (n == 0) return hex"00"; // root
            dns = new bytes(n + 2); // always 2-longer
            uint256 w;
            uint256 e;
            uint256 r;
            assembly {
                e := add(dns, 32)
                r := e // remember start
                for {
                    let a := add(ens, 32) // start of name
                    let b := add(a, n) // end of name
                } lt(a, b) {
                    a := add(a, 1)
                } {
                    let x := shr(248, mload(a)) // read byte
                    if eq(x, 46) {
                        w := sub(e, r) // length of label
                        if or(iszero(w), gt(w, 255)) {
                            break
                        } // something wrong
                        mstore8(r, w) // store length at start
                        r := add(e, 1) // update start
                    }
                    {
                        e := add(e, 1)
                        mstore8(e, x)
                    }
                }
            }
            w = e - r; // length of last label
            if (w == 0 || w > 255) revert DNSEncodingFailed(ens);
            assembly {
                mstore8(r, w) // store length
            }
        }
    }
}
