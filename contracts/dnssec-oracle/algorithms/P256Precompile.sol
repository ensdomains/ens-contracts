pragma solidity ^0.8.4;

library P256Precompile {
    /// @dev Verifies a P-256 ECDSA signature using EIP-7951 precompile.
    /// @param messageHash The SHA-256 hash of the message being verified.
    /// @param r The r component of the signature (32 bytes).
    /// @param s The s component of the signature (32 bytes).
    /// @param qx The x-coordinate of the public key (32 bytes).
    /// @param qy The y-coordinate of the public key (32 bytes).
    /// @return success True if the signature is valid, false otherwise.
    function verify(
        bytes32 messageHash,
        bytes32 r,
        bytes32 s,
        bytes32 qx,
        bytes32 qy
    ) internal view returns (bool success) {
        // EIP-7951 precompile input: hash(32) + r(32) + s(32) + x(32) + y(32) = 160 bytes
        bytes memory input = abi.encodePacked(messageHash, r, s, qx, qy);

        bytes memory output = new bytes(32);

        assembly {
            success := staticcall(
                gas(),
                0x100, // EIP-7951 P-256 precompile address
                add(input, 32),
                mload(input), // 160 bytes
                add(output, 32),
                32 // Output is 32 bytes
            )
        }

        // Precompile returns 32 bytes: 0x00...01 for valid, 0x00...00 for invalid
        if (success) {
            success = (output[31] == bytes1(0x01));
        }
    }
}

