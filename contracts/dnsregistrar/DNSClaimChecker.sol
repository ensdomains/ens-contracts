//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../dnssec-oracle/DNSSEC.sol";
import "../dnssec-oracle/BytesUtils.sol";
import "../dnssec-oracle/RRUtils.sol";
import "@ensdomains/buffer/contracts/Buffer.sol";

library DNSClaimChecker {
    using BytesUtils for bytes;
    using RRUtils for *;
    using Buffer for Buffer.buffer;

    uint16 constant CLASS_INET = 1;
    uint16 constant TYPE_TXT = 16;

    function getOwnerAddress(bytes memory name, bytes memory data)
        internal
        pure
        returns (address, bool)
    {
        // Add "_ens." to the front of the name.
        Buffer.buffer memory buf;
        buf.init(name.length + 5);
        buf.append("\x04_ens");
        buf.append(name);

        for (
            RRUtils.RRIterator memory iter = data.iterateRRs(0);
            !iter.done();
            iter.next()
        ) {
            bool found;
            address addr;
            (addr, found) = parseRR(data, iter.rdataOffset);
            if (found) {
                return (addr, true);
            }
        }

        return (address(0x0), false);
    }

    function parseRR(bytes memory rdata, uint256 idx)
        internal
        pure
        returns (address, bool)
    {
        while (idx < rdata.length) {
            uint256 len = rdata.readUint8(idx);
            idx += 1;

            bool found;
            address addr;
            (addr, found) = parseString(rdata, idx, len);

            if (found) return (addr, true);
            idx += len;
        }

        return (address(0x0), false);
    }

    function parseString(
        bytes memory str,
        uint256 idx,
        uint256 len
    ) internal pure returns (address, bool) {
        // TODO: More robust parsing that handles whitespace and multiple key/value pairs
        if (str.readUint32(idx) != 0x613d3078) return (address(0x0), false); // 0x613d3078 == 'a=0x'
        if (len < 44) return (address(0x0), false);
        return hexToAddress(str, idx + 4);
    }

    function hexToAddress(bytes memory str, uint256 idx)
        internal
        pure
        returns (address, bool)
    {
        if (str.length - idx < 40) return (address(0x0), false);
        uint256 ret = 0;
        for (uint256 i = idx; i < idx + 40; i++) {
            ret <<= 4;
            uint256 x = str.readUint8(i);
            if (x >= 48 && x < 58) {
                ret |= x - 48;
            } else if (x >= 65 && x < 71) {
                ret |= x - 55;
            } else if (x >= 97 && x < 103) {
                ret |= x - 87;
            } else {
                return (address(0x0), false);
            }
        }
        return (address(uint160(ret)), true);
    }
}
