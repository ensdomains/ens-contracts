//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @notice Validates bytes[] arrays according to the ABI specification.
library BytesArrayValidator {
    /// @notice Validates that the data is a valid ABI-encoded bytes[] array.
    /// @param data The data to validate.
    /// @return True if the data is a valid ABI-encoded bytes[] array, false otherwise.
    function isValidBytesArray(bytes memory data) internal pure returns (bool) {
        // The data must be at least 32 bytes long to contain the array length
        if (data.length < 32) return false;

        uint256 arrayOffset;
        uint256 arrayLength;
        assembly {
            arrayOffset := mload(add(data, 32))
            arrayLength := mload(add(data, add(arrayOffset, 32)))
        }

        // Limit length to a reasonable size to prevent excessive computation
        if (arrayLength > 1e6) return false;

        uint256 offsetsStart = arrayOffset + 32;
        uint256 offsetsEnd = offsetsStart + arrayLength * 32;

        if (arrayLength > 0) {
            if (data.length < offsetsEnd) return false;
        } else {
            if (data.length != 64) return false;
        }

        // Loop through each offset and validate the corresponding data
        for (uint256 i = 0; i < arrayLength; i++) {
            uint256 offset_i;
            assembly {
                offset_i := mload(
                    add(add(data, 32), add(offsetsStart, mul(i, 32)))
                )
            }

            // The offset plus 32 bytes must be within the data length to read the length of the element
            if (offsetsStart + offset_i + 32 > data.length) return false;

            uint256 Li; // Length of the i-th byte array
            assembly {
                // Read the length of the element from data[32 + offset_i .. 32 + offset_i + 31]
                Li := mload(add(add(add(data, 32), offset_i), offsetsStart))
            }

            // Calculate the end position of the element's data
            uint256 elementDataEnd = offset_i +
                (Li % 32 == 0 ? Li : Li + (32 - (Li % 32)));

            // The element data must be within the bounds of the data array
            if (elementDataEnd > data.length) return false;
        }

        // All checks passed; the data is a valid ABI-encoded bytes[]
        return true;
    }
}
