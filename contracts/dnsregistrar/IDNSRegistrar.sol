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
}
