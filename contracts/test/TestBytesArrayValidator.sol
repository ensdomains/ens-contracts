// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../universalResolver/BytesArrayValidator.sol";

contract TestBytesArrayValidator {
    function testValidBytesArray() public pure {
        // Create a valid bytes array
        bytes[] memory validArray = new bytes[](5);
        validArray[0] = "Hello";
        validArray[1] = "World";
        validArray[2] = "Two";
        validArray[3] = "Three";
        validArray[4] = "Four";
        bytes memory encodedValidArray = abi.encode(validArray);

        bool isValid = BytesArrayValidator.isValidBytesArray(encodedValidArray);
        require(isValid, "Should be a valid bytes array");
    }

    function testInvalidBytesArray() public pure {
        // Create an invalid bytes array (too short)
        bytes memory invalidArray = new bytes(16);

        bool isValid = BytesArrayValidator.isValidBytesArray(invalidArray);
        require(!isValid, "Should be an invalid bytes array");
    }

    function testEmptyBytesArray() public pure {
        // Create an empty bytes array
        bytes[] memory emptyArray = new bytes[](0);
        bytes memory encodedEmptyArray = abi.encode(emptyArray);

        bool isValid = BytesArrayValidator.isValidBytesArray(encodedEmptyArray);
        require(isValid, "Empty array should be valid");
    }

    function testEmptyItemInBytesArray() public pure {
        // Create an empty bytes array
        bytes[] memory emptyArray = new bytes[](1);
        emptyArray[0] = "";
        bytes memory encodedEmptyArray = abi.encode(emptyArray);

        bool isValid = BytesArrayValidator.isValidBytesArray(encodedEmptyArray);
        require(isValid, "Empty array should be valid");
    }

    function largeEmptyBytesArray() public pure {
        bytes[] memory largeArray = new bytes[](1000);
        bytes memory encodedLargeArray = abi.encode(largeArray);

        bool isValid = BytesArrayValidator.isValidBytesArray(encodedLargeArray);
        require(isValid, "Large array should be valid");
    }

    function testLargeBytesArray() public pure {
        // Create a large bytes array
        bytes[] memory largeArray = new bytes[](1000);
        for (uint i = 0; i < 1000; i++) {
            largeArray[i] = new bytes(100);
        }
        bytes memory encodedLargeArray = abi.encode(largeArray);

        bool isValid = BytesArrayValidator.isValidBytesArray(encodedLargeArray);
        require(isValid, "Large array should be valid");
    }

    function testInvalidOffsets() public pure {
        // Create an invalid bytes array with incorrect offsets
        bytes memory invalidOffsets = new bytes(128);
        // Set an invalid offset
        assembly {
            mstore(add(invalidOffsets, 64), 0x20)
        }

        bool isValid = BytesArrayValidator.isValidBytesArray(invalidOffsets);
        require(!isValid, "Array with invalid offsets should be invalid");
    }
}
