// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// example codings:
// - ens: "aaa.bb.c"
// - dns: "3aaa2bb1c0"

// observations:
// - ens.length = dns.length - 2
// - ens is offset 1-byte with lengths replaced with "."

error MalformedDNSEncoding(bytes dns);

library NameDecoder {
    function dnsDecodeName(
        bytes memory dns
    ) internal pure returns (string memory) {
        unchecked {
            uint256 n = dns.length;
            if (n == 1 && dns[0] == 0) return ""; // only valid answer is root
            if (n < 3) revert MalformedDNSEncoding(dns);
            bytes memory v = new bytes(n - 2); // always 2-shorter
            uint256 src = 0;
            uint256 dst = 0;
            while (src < n) {
                uint8 len = uint8(dns[src++]);
                if (len == 0) break;
                uint256 end = src + len;
                if (end > dns.length) revert MalformedDNSEncoding(dns); // overflow
                if (dst > 0) v[dst++] = ".";
                while (src < end) {
                    bytes1 x = dns[src++];
                    if (x == ".") revert MalformedDNSEncoding(dns); // malicious label
                    v[dst++] = x;
                }
            }
            if (src != dns.length) revert MalformedDNSEncoding(dns); // junk at end
            return string(v);
        }
    }
}
