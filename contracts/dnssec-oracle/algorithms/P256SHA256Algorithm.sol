// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./Algorithm.sol";
import "./P256Precompile.sol";

/// @title P256SHA256Algorithm
/// @notice DNSSEC Algorithm 13 (ECDSAP256SHA256) implementation using EIP-7951 precompile
/// @dev Replaces the Solidity-based EllipticCurve implementation with native P-256 verification
contract P256SHA256Algorithm is Algorithm {
    /// @dev Verifies a DNSSEC signature.
    /// @param key The DNSKEY RDATA (68 bytes: 4-byte header + 64-byte public key).
    /// @param data The signed data to verify.
    /// @param signature The signature to verify (64 bytes: r + s).
    /// @return True iff the signature is valid.
    function verify(
        bytes calldata key,
        bytes calldata data,
        bytes calldata signature
    ) external view override returns (bool) {
        require(signature.length == 64, "Invalid p256 signature length");
        require(key.length == 68, "Invalid p256 key length");

        // Extract signature components (r, s) and public key (qx, qy)
        // Key format: 4-byte DNSKEY header (flags, protocol, algorithm) + 64-byte public key
        bytes32 r;
        bytes32 s;
        bytes32 qx;
        bytes32 qy;

        assembly {
            // signature.offset points to start of signature in calldata
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            // key.offset + 4 skips the DNSKEY header
            qx := calldataload(add(key.offset, 4))
            qy := calldataload(add(key.offset, 36))
        }

        return P256Precompile.verify(sha256(data), r, s, qx, qy);
    }
}
