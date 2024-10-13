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

    function testLargeEmptyBytesArray() public pure {
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

    function test64ByteArrayOffset() public pure {
        bytes memory data = new bytes(320);
        
        assembly {
            // Set array offset
            mstore(add(data, 32), 64)
            // Set array length
            mstore(add(data, 96), 2)
            // Set offset elements
            mstore(add(data, 128), 64)
            mstore(add(data, 160), 128)
            // Encode first element
            mstore(add(data, 192), 5)
            mstore(add(data, 224), shl(216, 0x48656C6C6F)) // "Hello"
            // Encode second element
            mstore(add(data, 256), 5)
            mstore(add(data, 288), shl(216, 0x576F726C64)) // "World"
        }

        bool isValid = BytesArrayValidator.isValidBytesArray(data);
        require(isValid, "Array with 64 byte offset should be valid");
    }
}
