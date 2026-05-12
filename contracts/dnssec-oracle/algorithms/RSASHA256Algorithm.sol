pragma solidity ^0.8.4;

import "./Algorithm.sol";
import "./RSAPKCS1Verify.sol";
import "../../utils/BytesUtils.sol";

/// @dev Implements the DNSSEC RSASHA256 algorithm.
contract RSASHA256Algorithm is Algorithm {
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
            modulus = key.substring(
                exponentLen + 5,
                key.length - exponentLen - 5
            );
        } else {
            exponentLen = key.readUint16(5);
            exponent = key.substring(7, exponentLen);
            modulus = key.substring(
                exponentLen + 7,
                key.length - exponentLen - 7
            );
        }

        return RSAPKCS1Verify.verifySHA256(modulus, exponent, sig, sha256(data));
    }
}
