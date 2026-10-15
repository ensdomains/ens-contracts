//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../dnssec-oracle/DNSSEC.sol";
import "../dnssec-oracle/RRUtils.sol";
import "../utils/BytesUtils.sol";
import "../utils/HexUtils.sol";
import "@ensdomains/buffer/contracts/Buffer.sol";

library DNSClaimChecker {
    using BytesUtils for bytes;
    using HexUtils for bytes;
    using RRUtils for *;
    using Buffer for Buffer.buffer;

    function getOwnerAddress(
        bytes memory name,
        bytes memory data
    ) internal pure returns (address addr, bool found) {
        // Add "_ens." to the front of the name.
        Buffer.buffer memory buf;
        buf.init(name.length + 5);
        buf.append("\x04_ens");
        buf.append(name);

        for (
            RRUtils.RRIterator memory iter = data.iterateRRs(0);
            !found && !iter.done();
            iter.next()
        ) {
            if (
                iter.class == RRUtils.CLASS_INET &&
                iter.dnstype == RRUtils.DNSTYPE_TXT &&
                iter.name().compareNames(buf.buf) == 0
            ) {
                (addr, found) = parseRR(
                    data,
                    iter.rdataOffset,
                    iter.nextOffset
                );
            }
        }
    }

    function parseRR(
        bytes memory rdata,
        uint256 idx,
        uint256 endIdx
    ) internal pure returns (address addr, bool found) {
        while (!found && idx < endIdx) {
            uint256 len = rdata.readUint8(idx);
            idx += 1;
            (addr, found) = parseString(rdata, idx, len);
            idx += len;
        }
    }

    function parseString(
        bytes memory str,
        uint256 idx,
        uint256 len
    ) internal pure returns (address, bool) {
        // TODO: More robust parsing that handles whitespace and multiple key/value pairs
        if (str.readUint32(idx) != 0x613d3078) return (address(0x0), false); // 0x613d3078 == 'a=0x'
        return str.hexToAddress(idx + 4, idx + len);
    }
}
