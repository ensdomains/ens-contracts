pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "./Owned.sol";
import "./BytesUtils.sol";
import "./RRUtils.sol";
import "./DNSSEC.sol";
import "./algorithms/Algorithm.sol";
import "./digests/Digest.sol";
import "./nsec3digests/NSEC3Digest.sol";
import "@ensdomains/buffer/contracts/Buffer.sol";

/*
 * @dev An oracle contract that verifies and stores DNSSEC-validated DNS records.
 *
 */
contract DNSSECImpl is DNSSEC, Owned {
    using Buffer for Buffer.buffer;
    using BytesUtils for bytes;
    using RRUtils for *;

    uint16 constant DNSCLASS_IN = 1;

    uint16 constant DNSTYPE_NS = 2;
    uint16 constant DNSTYPE_SOA = 6;
    uint16 constant DNSTYPE_DNAME = 39;
    uint16 constant DNSTYPE_DS = 43;
    uint16 constant DNSTYPE_RRSIG = 46;
    uint16 constant DNSTYPE_DNSKEY = 48;

    uint constant DNSKEY_FLAG_ZONEKEY = 0x100;

    uint8 constant ALGORITHM_RSASHA256 = 8;

    uint8 constant DIGEST_ALGORITHM_SHA256 = 2;

    struct RRSet {
        uint32 inception;
        uint32 expiration;
        bytes20 hash;
    }

    // (name, type) => RRSet
    mapping (bytes32 => mapping(uint16 => RRSet)) rrsets;

    mapping (uint8 => Algorithm) public algorithms;
    mapping (uint8 => Digest) public digests;

    event Test(uint t);
    event Marker();

    /**
     * @dev Constructor.
     * @param _anchors The binary format RR entries for the root DS records.
     */
    constructor(bytes memory _anchors) {
        // Insert the 'trust anchors' - the key hashes that start the chain
        // of trust for all other records.
        anchors = _anchors;
        rrsets[keccak256(hex"00")][DNSTYPE_DS] = RRSet({
            inception: uint32(0),
            expiration: uint32(3767581600), // May 22 2089 - the latest date we can encode as of writing this
            hash: bytes20(keccak256(anchors))
        });
        emit RRSetUpdated(hex"00", anchors);
    }

    /**
     * @dev Sets the contract address for a signature verification algorithm.
     *      Callable only by the owner.
     * @param id The algorithm ID
     * @param algo The address of the algorithm contract.
     */
    function setAlgorithm(uint8 id, Algorithm algo) public owner_only {
        algorithms[id] = algo;
        emit AlgorithmUpdated(id, address(algo));
    }

    /**
     * @dev Sets the contract address for a digest verification algorithm.
     *      Callable only by the owner.
     * @param id The digest ID
     * @param digest The address of the digest contract.
     */
    function setDigest(uint8 id, Digest digest) public owner_only {
        digests[id] = digest;
        emit DigestUpdated(id, address(digest));
    }

  
    function decodeOwnerNameHash(bytes memory name) private pure returns(bytes32) {
        return name.base32HexDecodeWord(1, uint(name.readUint8(0)));
    }

    /**
     * @dev Returns data about the RRs (if any) known to this oracle with the provided type and name.
     * @param dnstype The DNS record type to query.
     * @param name The name to query, in DNS label-sequence format.
     * @return inception The unix timestamp (wrapped) at which the signature for this RRSET was created.
     * @return expiration The unix timestamp (wrapped) at which the signature for this RRSET expires.
     * @return hash The hash of the RRset.
     */
    function rrdata(uint16 dnstype, bytes calldata name) external override view returns (uint32, uint32, bytes20) {
        RRSet storage result = rrsets[keccak256(name)][dnstype];
        return (result.inception, result.expiration, result.hash);
    }

    /**
     * @dev Submits a signed set of RRs to the oracle.
     *
     * RRSETs are only accepted if they are signed with a key that is already
     * trusted, or if they are self-signed, and the signing key is identified by
     * a DS record that is already trusted.
     *
     * @param input The signed RR set. This is in the format described in section
     *        5.3.2 of RFC4035: The RRDATA section from the RRSIG without the signature
     *        data, followed by a series of canonicalised RR records that the signature
     *        applies to.
     * @param proof The DNSKEY or DS to validate the signature against. Must Already
     *        have been submitted and proved previously.
     */
    function validateSignedSet(RRSetWithSignature memory input, bytes memory proof) internal view returns(RRUtils.SignedSet memory rrset) {
        rrset = input.rrset.readSignedSet();
        require(validProof(rrset.signerName, proof));

        // Do some basic checks on the RRs and extract the name
        bytes memory name = validateRRs(rrset, rrset.typeCovered);
        require(name.labelCount(0) == rrset.labels);
        rrset.name = name;

        // All comparisons involving the Signature Expiration and
        // Inception fields MUST use "serial number arithmetic", as
        // defined in RFC 1982

        // o  The validator's notion of the current time MUST be less than or
        //    equal to the time listed in the RRSIG RR's Expiration field.
        require(RRUtils.serialNumberGte(rrset.expiration, uint32(block.timestamp)));

        // o  The validator's notion of the current time MUST be greater than or
        //    equal to the time listed in the RRSIG RR's Inception field.
        require(RRUtils.serialNumberGte(uint32(block.timestamp), rrset.inception));

        // Validate the signature
        verifySignature(name, rrset, input, proof);

        return rrset;
    }

    function validProof(bytes memory name, bytes memory proof) internal view returns(bool) {
        uint16 dnstype = proof.readUint16(proof.nameLength(0));
        return rrsets[keccak256(name)][dnstype].hash == bytes20(keccak256(proof));
    }

    /**
     * @dev Validates a set of RRs.
     * @param rrset The RR set.
     * @param typecovered The type covered by the RRSIG record.
     */
    function validateRRs(RRUtils.SignedSet memory rrset, uint16 typecovered) internal pure returns (bytes memory name) {
        // Iterate over all the RRs
        for (RRUtils.RRIterator memory iter = rrset.rrs(); !iter.done(); iter.next()) {
            // We only support class IN (Internet)
            require(iter.class == DNSCLASS_IN);

            if(name.length == 0) {
                name = iter.name();
            } else {
                // Name must be the same on all RRs. We do things this way to avoid copying the name
                // repeatedly.
                require(name.length == iter.data.nameLength(iter.offset));
                require(name.equals(0, iter.data, iter.offset, name.length));
            }

            // o  The RRSIG RR's Type Covered field MUST equal the RRset's type.
            require(iter.dnstype == typecovered);
        }
    }

    /**
     * @dev Performs signature verification.
     *
     * Throws or reverts if unable to verify the record.
     *
     * @param name The name of the RRSIG record, in DNS label-sequence format.
     * @param data The original data to verify.
     * @param proof A DS or DNSKEY record that's already verified by the oracle.
     */
    function verifySignature(bytes memory name, RRUtils.SignedSet memory rrset, RRSetWithSignature memory data, bytes memory proof) internal view {
        // o  The RRSIG RR's Signer's Name field MUST be the name of the zone
        //    that contains the RRset.
        require(rrset.signerName.length <= name.length);
        require(rrset.signerName.equals(0, name, name.length - rrset.signerName.length));

        RRUtils.RRIterator memory proofRR = proof.iterateRRs(0);
        // Check the proof
        if (proofRR.dnstype == DNSTYPE_DS) {
            require(verifyWithDS(rrset, data, proofRR));
        } else if (proofRR.dnstype == DNSTYPE_DNSKEY) {
            require(verifyWithKnownKey(rrset, data, proofRR));
        } else {
            revert("No valid proof found");
        }
    }

    /**
     * @dev Attempts to verify a signed RRSET against an already known public key.
     * @param rrset The signed set to verify.
     * @param data The original data the signed set was read from.
     * @param proof The serialized DS or DNSKEY record to use as proof.
     * @return True if the RRSET could be verified, false otherwise.
     */
    function verifyWithKnownKey(RRUtils.SignedSet memory rrset, RRSetWithSignature memory data, RRUtils.RRIterator memory proof) internal view returns(bool) {
        // Check the DNSKEY's owner name matches the signer name on the RRSIG
        require(proof.name().equals(rrset.signerName));
        for(; !proof.done(); proof.next()) {
            require(proof.name().equals(rrset.signerName));
            bytes memory keyrdata = proof.rdata();
            RRUtils.DNSKEY memory dnskey = keyrdata.readDNSKEY(0, keyrdata.length);
            if(verifySignatureWithKey(dnskey, keyrdata, rrset, data)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Attempts to verify some data using a provided key and a signature.
     * @param dnskey The dns key record to verify the signature with.
     * @param rrset The signed RRSET being verified.
     * @param data The original data `rrset` was decoded from.
     * @return True iff the key verifies the signature.
     */
    function verifySignatureWithKey(RRUtils.DNSKEY memory dnskey, bytes memory keyrdata, RRUtils.SignedSet memory rrset, RRSetWithSignature memory data)
        internal
        view
        returns (bool)
    {
        // TODO: Check key isn't expired, unless updating key itself

        // The Protocol Field MUST have value 3 (RFC4034 2.1.2)
        if(dnskey.protocol != 3) {
            return false;
        }

        // o The RRSIG RR's Signer's Name, Algorithm, and Key Tag fields MUST
        //   match the owner name, algorithm, and key tag for some DNSKEY RR in
        //   the zone's apex DNSKEY RRset.
        if(dnskey.algorithm != rrset.algorithm) {
            return false;
        }
        uint16 computedkeytag = keyrdata.computeKeytag();
        if (computedkeytag != rrset.keytag) {
            return false;
        }

        // o The matching DNSKEY RR MUST be present in the zone's apex DNSKEY
        //   RRset, and MUST have the Zone Flag bit (DNSKEY RDATA Flag bit 7)
        //   set.
        if (dnskey.flags & DNSKEY_FLAG_ZONEKEY == 0) {
            return false;
        }

        return algorithms[dnskey.algorithm].verify(keyrdata, data.rrset, data.sig);
    }

    /**
     * @dev Attempts to verify a signed RRSET against an already known hash. This function assumes
     *      that the record 
     * @param rrset The signed set to verify.
     * @param data The original data the signed set was read from.
     * @param proof The serialized DS or DNSKEY record to use as proof.
     * @return True if the RRSET could be verified, false otherwise.
     */
    function verifyWithDS(RRUtils.SignedSet memory rrset, RRSetWithSignature memory data, RRUtils.RRIterator memory proof) internal view returns(bool) {
        for(RRUtils.RRIterator memory iter = rrset.rrs(); !iter.done(); iter.next()) {
            require(iter.dnstype == DNSTYPE_DNSKEY);
            bytes memory keyrdata = iter.rdata();
            RRUtils.DNSKEY memory dnskey = keyrdata.readDNSKEY(0, keyrdata.length);
            if (verifySignatureWithKey(dnskey, keyrdata, rrset, data)) {
                // It's self-signed - look for a DS record to verify it.
                return verifyKeyWithDS(iter.name(), proof, dnskey, keyrdata);
            }
        }
        return false;
    }

    /**
     * @dev Attempts to verify a key using DS records.
     * @param keyname The DNS name of the key, in DNS label-sequence format.
     * @param dsrrs The DS records to use in verification.
     * @param dnskey The dnskey to verify.
     * @param keyrdata The RDATA section of the key.
     * @return True if a DS record verifies this key.
     */
    function verifyKeyWithDS(bytes memory keyname, RRUtils.RRIterator memory dsrrs, RRUtils.DNSKEY memory dnskey, bytes memory keyrdata)
        internal view returns (bool)
    {
        uint16 keytag = keyrdata.computeKeytag();
        for (; !dsrrs.done(); dsrrs.next()) {
            RRUtils.DS memory ds = dsrrs.data.readDS(dsrrs.rdataOffset, dsrrs.nextOffset - dsrrs.rdataOffset);
            if(ds.keytag != keytag) {
                continue;
            }
            if (ds.algorithm != dnskey.algorithm) {
                continue;
            }

            Buffer.buffer memory buf;
            buf.init(keyname.length + keyrdata.length);
            buf.append(keyname);
            buf.append(keyrdata);
            if (verifyDSHash(ds.digestType, buf.buf, ds.digest)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Attempts to verify a DS record's hash value against some data.
     * @param digesttype The digest ID from the DS record.
     * @param data The data to digest.
     * @param digest The digest data to check against.
     * @return True iff the digest matches.
     */
    function verifyDSHash(uint8 digesttype, bytes memory data, bytes memory digest) internal view returns (bool) {
        if (address(digests[digesttype]) == address(0)) {
            return false;
        }
        return digests[digesttype].verify(data, digest);
    }
}
