// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.4;
pragma abicoder v2;

abstract contract DNSSEC {

    bytes public anchors;

    struct RRSetWithSignature {
        bytes rrset;
        bytes sig;
    }

    event AlgorithmUpdated(uint8 id, address addr);
    event DigestUpdated(uint8 id, address addr);
    event RRSetUpdated(bytes name, bytes rrset);

    function rrdata(uint16 dnstype, bytes calldata name) external virtual view returns (uint32, uint32, bytes20);
}
