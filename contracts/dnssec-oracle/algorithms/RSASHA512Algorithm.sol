// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./Algorithm.sol";
import "./RSAPKCS1Verify.sol";
import "../../utils/BytesUtils.sol";
import "../SHA512.sol";

/// @title RSASHA512Algorithm
/// @notice DNSSEC algorithm 10, RSA/SHA-512, RFC 5702.
/// @dev The ENS oracle registers algorithms 5, 7, 8 and 13. A zone signed with 10 cannot be
///      verified, so `DNSSECImpl` rejects its proofs. 28 names in the IANA root sign with it,
///      25 of them on the on-chain public suffix list, measured 20 November 2026.
///
///      The key format and the parsing below are identical to `RSASHA256Algorithm`, because
///      RFC 5702 gives algorithms 8 and 10 the same DNSKEY encoding and differs only in the
///      hash. The one change is `verifySHA512` in place of `verifySHA256`, with the digest
///      computed by `SHA512` rather than by a precompile, because the EVM has none.
contract RSASHA512Algorithm is Algorithm {
    using BytesUtils for *;

    function verify(
        bytes calldata key,
        bytes calldata data,
        bytes calldata sig
    ) external view override returns (bool) {
        bytes memory exponent;
        bytes memory modulus;

        uint16 exponentLen = uint16(key.readUint8(4));
        if (exponentLen != 0) {
            exponent = key.substring(5, exponentLen);
            modulus = key.substring(exponentLen + 5, key.length - exponentLen - 5);
        } else {
            exponentLen = key.readUint16(5);
            exponent = key.substring(7, exponentLen);
            modulus = key.substring(exponentLen + 7, key.length - exponentLen - 7);
        }

        return RSAPKCS1Verify.verifySHA512(modulus, exponent, sig, SHA512.hash(data));
    }
}
