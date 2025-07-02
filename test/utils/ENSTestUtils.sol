// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title ENSTestUtils
 * @dev Utility functions for ENS test suite to avoid duplication
 */
library ENSTestUtils {
    /**
     * @dev Computes the hash of a label
     * @param label The label to hash
     * @return The keccak256 hash of the label
     */
    function labelhash(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }
    
    /**
     * @dev Computes the namehash of a name
     * @param name The name to hash (e.g., "sub.example.eth")
     * @return node The namehash of the name
     */
    function namehash(string memory name) internal pure returns (bytes32 node) {
        // Empty name returns zero hash
        if (bytes(name).length == 0) {
            return bytes32(0);
        }
        
        // Start with zero hash
        node = bytes32(0);
        
        // Split the name by dots and hash from right to left
        bytes memory nameBytes = bytes(name);
        uint256 i = nameBytes.length;
        
        while (i > 0) {
            uint256 labelLength = 0;
            for (uint256 j = i; j > 0; j--) {
                if (nameBytes[j - 1] == 0x2e) { // '.'
                    break;
                }
                labelLength++;
            }
            
            bytes memory label = new bytes(labelLength);
            for (uint256 j = 0; j < labelLength; j++) {
                label[j] = nameBytes[i - labelLength + j];
            }
            
            node = keccak256(abi.encodePacked(node, keccak256(label)));
            
            if (i > labelLength) {
                i = i - labelLength - 1; // Skip the dot
            } else {
                break;
            }
        }
        
        return node;
    }
    
    /**
     * @dev Computes the namehash of a single label under a parent node
     * @param parentNode The parent node
     * @param label The label to add
     * @return The namehash of parentNode + label
     */
    function namehash(bytes32 parentNode, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, labelhash(label)));
    }
    
    /**
     * @dev Computes the namehash of a label under a parent node
     * @param parentNode The parent node
     * @param labelHash The hash of the label to add
     * @return The namehash of parentNode + labelHash
     */
    function namehash(bytes32 parentNode, bytes32 labelHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, labelHash));
    }
    
    /**
     * @dev Converts an address to its reverse node
     * @param addr The address to convert
     * @return The reverse node for the address
     */
    function reverseNode(address addr) internal pure returns (bytes32) {
        bytes32 ADDR_REVERSE_NODE = 0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
        return keccak256(abi.encodePacked(ADDR_REVERSE_NODE, sha3HexAddress(addr)));
    }
    
    /**
     * @dev Computes the sha3 hash of the lowercased hexadecimal representation of an address
     * @param addr The address to hash
     * @return ret The sha3 hash of the address
     */
    function sha3HexAddress(address addr) internal pure returns (bytes32 ret) {
        assembly {
            let lookup := 0x3031323334353637383961626364656600000000000000000000000000000000
            let i := 40
            for { } gt(i, 0) { } {
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
            }
            ret := keccak256(0, 40)
        }
    }
    
    /**
     * @dev Converts a string to lowercase
     * @param str The string to convert
     * @return The lowercase string
     */
    function toLower(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint i = 0; i < bStr.length; i++) {
            // Uppercase character...
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                // So we add 32 to make it lowercase
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }
    
    /**
     * @dev Checks if two strings are equal
     * @param a First string
     * @param b Second string
     * @return True if strings are equal
     */
    function strEqual(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
    
    /**
     * @dev Converts bytes32 to string (for labels)
     * @param x The bytes32 to convert
     * @return The string representation
     */
    function bytes32ToString(bytes32 x) internal pure returns (string memory) {
        bytes memory bytesString = new bytes(32);
        uint charCount = 0;
        for (uint j = 0; j < 32; j++) {
            bytes1 char = x[j];
            if (char != 0) {
                bytesString[charCount] = char;
                charCount++;
            }
        }
        bytes memory bytesStringTrimmed = new bytes(charCount);
        for (uint j = 0; j < charCount; j++) {
            bytesStringTrimmed[j] = bytesString[j];
        }
        return string(bytesStringTrimmed);
    }
    
    /**
     * @dev Creates a commitment hash for name registration
     * @param name The name to register
     * @param owner The owner address
     * @param duration The registration duration
     * @param secret The secret for commitment
     * @param resolver The resolver address
     * @param data The data for resolver
     * @param reverseRecord Whether to set reverse record
     * @param ownerControlledFuses The fuses to burn
     * @return The commitment hash
     */
    function makeCommitment(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] memory data,
        bool reverseRecord,
        uint16 ownerControlledFuses
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                labelhash(name),
                owner,
                duration,
                secret,
                resolver,
                data,
                reverseRecord,
                ownerControlledFuses
            )
        );
    }
    
    /**
     * @dev Creates a simple commitment hash (no resolver data)
     * @param name The name to register
     * @param owner The owner address
     * @param duration The registration duration
     * @param secret The secret for commitment
     * @return The commitment hash
     */
    function makeCommitment(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret
    ) internal pure returns (bytes32) {
        bytes[] memory emptyData;
        return makeCommitment(name, owner, duration, secret, address(0), emptyData, false, 0);
    }
}