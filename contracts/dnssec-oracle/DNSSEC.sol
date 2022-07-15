pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

abstract contract DNSSEC {
    bytes public anchors;

    struct RRSetWithSignature {
        bytes rrset;
        bytes sig;
    }

    event AlgorithmUpdated(uint8 id, address addr);
    event DigestUpdated(uint8 id, address addr);
    event NSEC3DigestUpdated(uint8 id, address addr);
    event RRSetUpdated(bytes name, bytes rrset);

    function submitRRSets(RRSetWithSignature[] memory input, bytes memory proof)
        public
        virtual
        returns (bytes memory);

    function submitRRSet(RRSetWithSignature memory input, bytes memory proof)
        public
        virtual
        returns (bytes memory);

    function deleteRRSet(
        uint16 deleteType,
        bytes memory deleteName,
        RRSetWithSignature memory nsec,
        bytes memory proof
    ) public virtual;

    function deleteRRSetNSEC3(
        uint16 deleteType,
        bytes memory deleteName,
        RRSetWithSignature memory closestEncloser,
        RRSetWithSignature memory nextClosest,
        bytes memory dnskey
    ) public virtual;

    function rrdata(uint16 dnstype, bytes calldata name)
        external
        view
        virtual
        returns (
            uint32,
            uint32,
            bytes20
        );
}
