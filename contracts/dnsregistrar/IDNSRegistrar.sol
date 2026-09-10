//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../dnssec-oracle/DNSSEC.sol";

interface IDNSRegistrar {
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

    /// @notice Get the latest inception time of a claim by record type.
    /// @dev `getInception("_ens.{domain}", 16) == inception(namehash(domain))`.
    /// @param name DNS-encoded name to query.
    /// @param typeCovered DNS resource record type.
    /// @return Inception time, in seconds.
    function getInception(
        bytes calldata name,
        uint16 typeCovered
    ) external view returns (uint32);

    /// @notice Get the latest inception time of a claim.
    /// @dev Corresponds to the TXT record of "_ens.{domain}".
    function inceptions(bytes32 node) external view returns (uint32);
}
