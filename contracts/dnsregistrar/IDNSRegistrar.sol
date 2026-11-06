//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {DNSSEC} from "../dnssec-oracle/DNSSEC.sol";

/// @dev v0 interface: https://github.com/ensdomains/ens-contracts/blob/v1.7.0/contracts/dnsregistrar/IDNSRegistrar.sol
bytes4 constant DNS_REGISTRAR_V0_INTERFACE_ID = 0x2f435428;

/// @dev Interface selector: `0x195b83b3`
interface IDNSRegistrar {
    ////////////////////////////////////////////////////////////////////////
    // Events
    ////////////////////////////////////////////////////////////////////////

    /// @notice Public suffix list was changed.
    /// @param suffixes The new public suffix list.
    event NewPublicSuffixList(address suffixes);

    /// @notice DNS name was claimed.
    /// @param node Namehash of the name.
    /// @param owner Owner of name.
    /// @param name DNS-encoded name.
    /// @param inception Inception time of the "_ens.{name}" record, in seconds.
    event Claim(
        bytes32 indexed node,
        address indexed owner,
        bytes name,
        uint32 inception
    );

    /// @notice A claim updated a stored inception.
    /// @param node Namehash of the name.
    /// @param typeCovered DNS resource record type.
    /// @param name DNS-encoded name.
    /// @param inception Inception time, in seconds.
    /// @param recordHash Hash of record data.
    event InceptionUpdated(
        bytes32 indexed node,
        uint16 indexed typeCovered,
        bytes name,
        uint32 inception,
        bytes28 recordHash
    );

    ////////////////////////////////////////////////////////////////////////
    // Errors
    ////////////////////////////////////////////////////////////////////////

    error InvalidPublicSuffix(bytes name);
    error NoOwnerRecordFound();
    error PermissionDenied(address caller, address owner);
    error PreconditionNotMet();

    /// @notice Proof for `name` was stale and the records were different.
    /// @dev Error selector: `0x6f505a80`
    error StaleProof(
        bytes name,
        uint16 typeCovered,
        uint32 lastInception,
        bytes28 lastRecordHash,
        uint32 inception,
        bytes28 recordHash
    );

    ////////////////////////////////////////////////////////////////////////
    // Functions
    ////////////////////////////////////////////////////////////////////////

    /// @notice Verify proofs with DNSSEC oracle, claim the name, and call `setSubnodeOwner()`.
    /// @param name DNS-encoded name to claim.
    /// @param input A chain of signed DNS RRSETs ending with a text record.
    function proveAndClaim(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input
    ) external;

    /// @notice Verify proofs with DNSSEC oracle, claim the name, and call `setSubnodeRecord()`.
    /// @param name DNS-encoded name to claim.
    /// @param input A chain of signed DNS RRSETs ending with a text record.
    /// @param resolver Resolver address to set.
    /// @param addr Ethereum Address (coin type = 60) to set.
    function proveAndClaimWithResolver(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input,
        address resolver,
        address addr
    ) external;

    /// @notice Get the latest inception time and hash of a claim by record type.
    /// @dev `recordHash` is computed from `bytes28(DNSClaimChecker.computeRecordHash())`.
    /// @param name DNS-encoded name to query.
    /// @param typeCovered DNS resource record type.
    /// @return inception Inception time, in seconds.
    /// @return recordHash Hash of record data.
    function getInception(
        bytes calldata name,
        uint16 typeCovered
    ) external view returns (uint32 inception, bytes28 recordHash);

    /// @notice Get the latest inception time of a claim.
    /// @dev Corresponds to the TXT record of "_ens.{name}".  The inception time from 
    /// `getInception("_ens.{name}", 16)` is equivalent to `inceptions(namehash(name))`.
    function inceptions(bytes32 node) external view returns (uint32);
}
