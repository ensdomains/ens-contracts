// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Utility functions for validating signatures with expiry
library SignatureUtils {
    /// @notice The signature is invalid
    error InvalidSignature();
    /// @notice The signature expiry is too high
    error SignatureExpiryTooHigh();
    /// @notice The signature has expired
    error SignatureExpired();

    /// @notice Validates a signature with expiry
    /// @param signature The signature to validate
    /// @param addr The address that signed the message
    /// @param message The message that was signed
    /// @param signatureExpiry The expiry of the signature
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
