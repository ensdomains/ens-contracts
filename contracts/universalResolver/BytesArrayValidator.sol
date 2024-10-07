//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library BytesArrayValidator {
    function isValidBytesArray(bytes memory data) internal pure returns (bool) {
        // The data must be at least 32 bytes long to contain the array length
        if (data.length < 32) {
            return false;
        }

        uint256 N; // Number of elements in the bytes[] array
        assembly {
            N := mload(add(data, 32)) // Read the array length from data[32..63]
        }

        // Limit N to a reasonable size to prevent excessive computation
        if (N > 1e6) {
            return false;
        }

        uint256 offsetsStart = 32; // The offsets start after the array length
        uint256 offsetsEnd = offsetsStart + N * 32;

        // The data must be long enough to include all offsets
        if (data.length < offsetsEnd) {
            return false;
        }

        // Loop through each offset and validate the corresponding data
        for (uint256 i = 0; i < N; i++) {
            uint256 offset_i;
            assembly {
                // Read the i-th offset from data[32 + i*32 .. 32 + (i+1)*32 - 1]
                offset_i := mload(add(add(data, offsetsStart), mul(32, i)))
            }

            // Offsets should point beyond the header (array length and offsets)
            if (offset_i < offsetsEnd) {
                return false;
            }

            // The offset plus 32 bytes must be within the data length to read the length of the element
            if (offset_i + 32 > data.length) {
                return false;
            }

            uint256 Li; // Length of the i-th byte array
            assembly {
                // Read the length of the element from data[32 + offset_i .. 32 + offset_i + 31]
                Li := mload(add(add(data, 32), offset_i))
            }

            // Calculate the end position of the element's data
            uint256 elementDataEnd = offset_i + 32 + Li;

            // The element data must be within the bounds of the data array
            if (elementDataEnd > data.length) {
                return false;
            }
        }

        // All checks passed; the data is a valid ABI-encoded bytes[]
        return true;
    }
}
