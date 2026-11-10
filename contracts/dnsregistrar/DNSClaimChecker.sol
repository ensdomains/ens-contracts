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

    /// @dev Compute hash of every record's `dnstype` and `rrdata`.
    ///      Does not include `name` and `class` (assumed valid) and `ttl` (ignored).
    function computeRecordHash(bytes memory data) internal pure returns (bytes32 hash) {
        for (
            RRUtils.RRIterator memory iter = data.iterateRRs(0);
            !iter.done();
            iter.next()
        ) {
            // valid rrs have same name
            uint256 rdataSize = iter.nextOffset - iter.rdataOffset;
            bytes32 rdataHash = data.keccak(iter.rdataOffset, rdataSize); // hash of rdata
            // ignore (ttl, class) => (uint16 dnstype, uint16 rdataSize)
            uint256 header = (uint256(iter.dnstype) << 16) | rdataSize; // 2+2 bytes
            assembly {
                mstore(0, header)
                mstore(32, rdataHash)
                mstore(32, keccak256(28, 36))
                mstore(0, hash)
                hash := keccak256(0, 64)
            }
        }
    }

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
