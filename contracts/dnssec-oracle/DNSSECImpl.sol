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
 * TODO: Support for NSEC3 records
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
    uint16 constant DNSTYPE_NSEC = 47;
    uint16 constant DNSTYPE_DNSKEY = 48;
    uint16 constant DNSTYPE_NSEC3 = 50;

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
    mapping (uint8 => NSEC3Digest) public nsec3Digests;

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

    /**
     * @dev Sets the contract address for an NSEC3 digest algorithm.
     *      Callable only by the owner.
     * @param id The digest ID
     * @param digest The address of the digest contract.
     */
    function setNSEC3Digest(uint8 id, NSEC3Digest digest) public owner_only {
        nsec3Digests[id] = digest;
        emit NSEC3DigestUpdated(id, address(digest));
    }

    /**
     * @dev Submits multiple RRSets
     * @param input A list of RRSets and signatures forming a chain of trust from an existing known-good record.
     * @param _proof The DNSKEY or DS to validate the first signature against.
     * @return The last RRSET submitted.
     */
    function submitRRSets(RRSetWithSignature[] memory input, bytes calldata _proof) public override returns (bytes memory) {
        bytes memory proof = _proof;
        for(uint i = 0; i < input.length; i++) {
            proof = _submitRRSet(input[i], proof);
        }
        return proof;
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
    function submitRRSet(RRSetWithSignature memory input, bytes memory proof)
        public override
        returns (bytes memory)
    {
        return _submitRRSet(input, proof);
    }

    /**
     * @dev Deletes an RR from the oracle.
     *
     * @param deleteType The DNS record type to delete.
     * @param deleteName which you want to delete
     * @param nsec The signed NSEC RRset. This is in the format described in section
     *        5.3.2 of RFC4035: The RRDATA section from the RRSIG without the signature
     *        data, followed by a series of canonicalised RR records that the signature
     *        applies to.
     */
    function deleteRRSet(uint16 deleteType, bytes memory deleteName, RRSetWithSignature memory nsec, bytes memory proof)
        public override
    {
        RRUtils.SignedSet memory rrset;
        rrset = validateSignedSet(nsec, proof);
        require(rrset.typeCovered == DNSTYPE_NSEC);

        // Don't let someone use an old proof to delete a new name
        require(RRUtils.serialNumberGte(rrset.inception, rrsets[keccak256(deleteName)][deleteType].inception));

        for (RRUtils.RRIterator memory iter = rrset.rrs(); !iter.done(); iter.next()) {
            // We're dealing with three names here:
            //   - deleteName is the name the user wants us to delete
            //   - nsecName is the owner name of the NSEC record
            //   - nextName is the next name specified in the NSEC record
            //
            // And three cases:
            //   - deleteName equals nsecName, in which case we can delete the
            //     record if it's not in the type bitmap.
            //   - nextName comes after nsecName, in which case we can delete
            //     the record if deleteName comes between nextName and nsecName.
            //   - nextName comes before nsecName, in which case nextName is the
            //     zone apex, and deleteName must come after nsecName.
            checkNsecName(iter, rrset.name, deleteName, deleteType);
            delete rrsets[keccak256(deleteName)][deleteType];
            return;
        }
        // We should never reach this point
        revert();
    }

    function checkNsecName(RRUtils.RRIterator memory iter, bytes memory nsecName, bytes memory deleteName, uint16 deleteType) private pure {
        uint rdataOffset = iter.rdataOffset;
        uint nextNameLength = iter.data.nameLength(rdataOffset);
        uint rDataLength = iter.nextOffset - iter.rdataOffset;

        // We assume that there is always typed bitmap after the next domain name
        require(rDataLength > nextNameLength);

        int compareResult = deleteName.compareNames(nsecName);
        if(compareResult == 0) {
            // Name to delete is on the same label as the NSEC record
            require(!iter.data.checkTypeBitmap(rdataOffset + nextNameLength, deleteType));
        } else {
            // First check if the NSEC next name comes after the NSEC name.
            bytes memory nextName = iter.data.substring(rdataOffset,nextNameLength);
            // deleteName must come after nsecName
            require(compareResult > 0);
            if(nsecName.compareNames(nextName) < 0) {
                // deleteName must also come before nextName
                require(deleteName.compareNames(nextName) < 0);
            }
        }
    }

    /**
     * @dev Deletes an RR from the oracle using an NSEC3 proof.
     *      Deleting a record using NSEC3 requires using up to two NSEC3 records. There are two cases:
     *       1. The name exists, but the record type doesn't. Eg, example.com has A records but no TXT records.
     *       2. The name does not exist, but a parent name does.
     *      In the first case, we submit one NSEC3 proof in `closestEncloser` that matches the target name
     *      but does not have the bit for `deleteType` set in its type bitmap. In the second case, we submit
     *      two proofs: closestEncloser and nextClosest, that together prove that the name does not exist.
     *      NSEC3 records are in the format described in section 5.3.2 of RFC4035: The RRDATA section
     *      from the RRSIG without the signature data, followed by a series of canonicalised RR records
     *      that the signature applies to.
     *
     * @param deleteType The DNS record type to delete.
     * @param deleteName The name to delete.
     * @param closestEncloser An NSEC3 proof matching the closest enclosing name - that is,
     *        the nearest ancestor of the target name that *does* exist.
     * @param nextClosest An NSEC3 proof covering the next closest name. This proves that the immediate
     *        subdomain of the closestEncloser does not exist.
     * @param dnskey An encoded DNSKEY record that has already been submitted to the oracle and can be used
     *        to verify the signatures closestEncloserSig and nextClosestSig
     */
    function deleteRRSetNSEC3(uint16 deleteType, bytes memory deleteName, RRSetWithSignature memory closestEncloser, RRSetWithSignature memory nextClosest, bytes memory dnskey)
        public override
    {
        uint32 originalInception = rrsets[keccak256(deleteName)][deleteType].inception;

        RRUtils.SignedSet memory ce = validateSignedSet(closestEncloser, dnskey);
        checkNSEC3Validity(ce, deleteName, originalInception);

        RRUtils.SignedSet memory nc;
        if(nextClosest.rrset.length > 0) {
            nc = validateSignedSet(nextClosest, dnskey);
            checkNSEC3Validity(nc, deleteName, originalInception);
        }

        RRUtils.NSEC3 memory ceNSEC3 = readNSEC3(ce);
        // The flags field must be 0 or 1 (RFC5155 section 8.2).
        require(ceNSEC3.flags & 0xfe == 0);
        // Check that the closest encloser is from the correct zone (RFC5155 section 8.3)
        // "The DNAME type bit must not be set and the NS type bit may only be set if the SOA type bit is set."
        require(!ceNSEC3.checkTypeBitmap(DNSTYPE_DNAME) && (!ceNSEC3.checkTypeBitmap(DNSTYPE_NS) || ceNSEC3.checkTypeBitmap(DNSTYPE_SOA)));

        // Case 1: deleteName does exist, but no records of RRTYPE deleteType do.
        if(isMatchingNSEC3Record(deleteType, deleteName, ce.name, ceNSEC3)) {
            delete rrsets[keccak256(deleteName)][deleteType];
        // Case 2: deleteName does not exist.
        } else if(isCoveringNSEC3Record(deleteName, ce.name, ceNSEC3, nc.name, readNSEC3(nc))) {
            delete rrsets[keccak256(deleteName)][deleteType];
        } else {
            revert();
        }
    }

    function checkNSEC3Validity(RRUtils.SignedSet memory nsec, bytes memory deleteName, uint32 originalInception) private pure {
        // The records must have been signed after the record we're trying to delete
        require(RRUtils.serialNumberGte(nsec.inception, originalInception));

        // The record must be an NSEC3
        require(nsec.typeCovered == DNSTYPE_NSEC3);

        // nsecName is of the form <hash>.zone.xyz. <hash> is the NSEC3 hash of the entire name the NSEC3 record matches, while
        // zone.xyz can be any ancestor of that name. We'll check that, so someone can't use a record on foo.com
        // as proof of the nonexistence of bar.org.
        require(checkNSEC3OwnerName(nsec.name, deleteName));
    }

    function isMatchingNSEC3Record(uint16 deleteType, bytes memory deleteName, bytes memory closestEncloserName, RRUtils.NSEC3 memory closestEncloser) private view returns(bool) {
        // Check the record matches the hashed name, but the type bitmap does not include the type
        if(checkNSEC3Name(closestEncloser, closestEncloserName, deleteName)) {
            return !closestEncloser.checkTypeBitmap(deleteType);
        }

        return false;
    }

    function isCoveringNSEC3Record(bytes memory deleteName, bytes memory ceName, RRUtils.NSEC3 memory ce, bytes memory ncName, RRUtils.NSEC3 memory nc) private view returns(bool) {
        // The flags field must be 0 or 1 (RFC5155 section 8.2).
        require(nc.flags & 0xfe == 0);

        bytes32 ceNameHash = decodeOwnerNameHash(ceName);
        bytes32 ncNameHash = decodeOwnerNameHash(ncName);

        uint lastOffset = 0;
        // Iterate over suffixes of the name to delete until one matches the closest encloser
        for(uint offset = deleteName.readUint8(0) + 1; offset < deleteName.length; offset += deleteName.readUint8(offset) + 1) {
            if(hashName(ce, deleteName.substring(offset, deleteName.length - offset)) == ceNameHash) {
                // Check that the next closest record encloses the name one label longer
                bytes32 checkHash = hashName(nc, deleteName.substring(lastOffset, deleteName.length - lastOffset));
                if(ncNameHash < nc.nextHashedOwnerName) {
                    return checkHash > ncNameHash && checkHash < nc.nextHashedOwnerName;
                } else {
                    return checkHash > ncNameHash || checkHash < nc.nextHashedOwnerName;
                }
            }
            lastOffset = offset;
        }
        // If we reached the root without finding a match, return false.
        return false;
    }

    function readNSEC3(RRUtils.SignedSet memory ss) private pure returns(RRUtils.NSEC3 memory) {
        RRUtils.RRIterator memory iter = ss.rrs();
        return iter.data.readNSEC3(iter.rdataOffset, iter.nextOffset - iter.rdataOffset);
    }

    function checkNSEC3Name(RRUtils.NSEC3 memory nsec, bytes memory ownerName, bytes memory deleteName) private view returns(bool) {
        // Compute the NSEC3 name hash of the name to delete.
        bytes32 deleteNameHash = hashName(nsec, deleteName);

        // Decode the NSEC3 name hash from the first label of the NSEC3 owner name.
        bytes32 nsecNameHash = decodeOwnerNameHash(ownerName);

        return deleteNameHash == nsecNameHash;
    }

    function hashName(RRUtils.NSEC3 memory nsec, bytes memory name) private view returns(bytes32) {
        return nsec3Digests[nsec.hashAlgorithm].hash(nsec.salt, name, nsec.iterations);
    }

    function decodeOwnerNameHash(bytes memory name) private pure returns(bytes32) {
        return name.base32HexDecodeWord(1, uint(name.readUint8(0)));
    }

    function checkNSEC3OwnerName(bytes memory nsecName, bytes memory deleteName) private pure returns(bool) {
        uint nsecNameOffset = nsecName.readUint8(0) + 1;
        uint deleteNameOffset = 0;
        while(deleteNameOffset < deleteName.length) {
            if(deleteName.equals(deleteNameOffset, nsecName, nsecNameOffset)) {
                return true;
            }
            deleteNameOffset += deleteName.readUint8(deleteNameOffset) + 1;
        }
        return false;
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

    function _submitRRSet(RRSetWithSignature memory input, bytes memory proof) internal returns (bytes memory) {
        RRUtils.SignedSet memory rrset;
        rrset = validateSignedSet(input, proof);

        RRSet storage storedSet = rrsets[keccak256(rrset.name)][rrset.typeCovered];
        if (storedSet.hash != bytes20(0)) {
            // To replace an existing rrset, the signature must be at least as new
            require(RRUtils.serialNumberGte(rrset.inception, storedSet.inception));
        }
        rrsets[keccak256(rrset.name)][rrset.typeCovered] = RRSet({
            inception: rrset.inception,
            expiration: rrset.expiration,
            hash: bytes20(keccak256(rrset.data))
        });

        emit RRSetUpdated(rrset.name, rrset.data);

        return rrset.data;
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
