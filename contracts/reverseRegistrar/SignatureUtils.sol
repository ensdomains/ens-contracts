// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

error InvalidSignature();
error SignatureExpiryTooHigh();
error SignatureExpired();

library SignatureUtils {
    function validateSignatureWithExpiry(
        bytes memory signature,
        address addr,
        bytes32 message,
        uint256 signatureExpiry
    ) internal view {
        if (!SignatureChecker.isValidSignatureNow(addr, message, signature))
            revert InvalidSignature();
        if (signatureExpiry < block.timestamp) revert SignatureExpired();
        if (signatureExpiry > block.timestamp + 1 hours)
            revert SignatureExpiryTooHigh();
    }
}
