pragma solidity ^0.8.4;

import "./RSAVerify.sol";
import "../../utils/BytesUtils.sol";

/// @dev Library for PKCS#1 v1.5 signature verification
library RSAPKCS1Verify {
    using BytesUtils for *;

    /// @dev PKCS#1 v1.5 DigestInfo prefix for SHA-1
    bytes constant SHA1_DIGEST_INFO = hex"3021300906052b0e03021a05000414";

    /// @dev PKCS#1 v1.5 DigestInfo prefix for SHA-256
    bytes constant SHA256_DIGEST_INFO = hex"3031300d060960864801650304020105000420";

    /// @dev Verifies an RSA signature with PKCS#1 v1.5 padding for SHA-1
    function verifySHA1(
        bytes memory modulus,
        bytes memory exponent,
        bytes memory sig,
        bytes20 hash
    ) internal view returns (bool) {
        (bool ok, bytes memory result) = recoverAndVerify(modulus, exponent, sig, SHA1_DIGEST_INFO);
        return ok && hash == result.readBytes20(result.length - 20);
    }

    /// @dev Verifies an RSA signature with PKCS#1 v1.5 padding for SHA-256
    function verifySHA256(
        bytes memory modulus,
        bytes memory exponent,
        bytes memory sig,
        bytes32 hash
    ) internal view returns (bool) {
        (bool ok, bytes memory result) = recoverAndVerify(modulus, exponent, sig, SHA256_DIGEST_INFO);
        return ok && hash == result.readBytes32(result.length - 32);
    }

    /// @dev Recovers RSA signature and verifies PKCS#1 v1.5 structure
    /// Format: 0x00 0x01 [0xFF padding] 0x00 [DigestInfo] [Hash]
    /// https://datatracker.ietf.org/doc/html/rfc8017#section-9.2
    function recoverAndVerify(
        bytes memory modulus,
        bytes memory exponent,
        bytes memory sig,
        bytes memory digestInfo
    ) private view returns (bool, bytes memory) {
        (bool ok, bytes memory result) = RSAVerify.rsarecover(modulus, exponent, sig);
        if (!ok || result.length != modulus.length) {
            return (false, result);
        }

        // Check leading bytes: 0x00 0x01
        if (result[0] != 0x00 || result[1] != 0x01) {
            return (false, result);
        }

        // Calculate positions working backwards from the end
        uint256 hashLen = digestInfo.length == 15 ? 20 : 32;
        uint256 hashStart = result.length - hashLen;
        uint256 digestInfoStart = hashStart - digestInfo.length;

        // Verify 0x00 separator before DigestInfo
        if (result[digestInfoStart - 1] != 0x00) {
            return (false, result);
        }

        // Verify DigestInfo matches expected value
        if (!result.equals(digestInfoStart, digestInfo, 0, digestInfo.length)) {
            return (false, result);
        }

        // Verify padding: all bytes from position 2 to separator must be 0xFF
        // Minimum 8 bytes of 0xFF padding required (RFC 3447)
        uint256 paddingLen = digestInfoStart - 1 - 2;
        if (paddingLen < 8) {
            return (false, result);
        }
        for (uint256 i = 2; i < digestInfoStart - 1; i++) {
            if (result[i] != 0xFF) {
                return (false, result);
            }
        }

        return (true, result);
    }
}
