// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title DNSTestUtils
 * @dev Utility library for DNS test data creation
 */
library DNSTestUtils {
    
    /**
     * @dev Encode DNS name to wire format
     */
    function encodeDNSName(string memory name) internal pure returns (bytes memory) {
        bytes memory nameBytes = bytes(name);
        bytes memory result = new bytes(nameBytes.length + 2);
        
        // Split by dots and encode each label
        uint256 resultIdx = 0;
        uint256 labelStart = 0;
        
        for (uint256 i = 0; i <= nameBytes.length; i++) {
            if (i == nameBytes.length || nameBytes[i] == ".") {
                uint256 labelLen = i - labelStart;
                result[resultIdx++] = bytes1(uint8(labelLen));
                for (uint256 j = labelStart; j < i; j++) {
                    result[resultIdx++] = nameBytes[j];
                }
                labelStart = i + 1;
            }
        }
        result[resultIdx] = 0x00; // null terminator
        
        // Resize to actual length
        assembly {
            mstore(result, add(resultIdx, 1))
        }
        
        return result;
    }
    
    /**
     * @dev Convert address to hex string (without 0x prefix)
     */
    function addressToString(address addr) internal pure returns (string memory) {
        bytes memory data = abi.encodePacked(addr);
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(40); // 40 chars for address without 0x prefix
        
        for (uint i = 0; i < 20; i++) {
            str[i*2] = alphabet[uint8(data[i] >> 4)];
            str[i*2+1] = alphabet[uint8(data[i] & 0x0f)];
        }
        
        return string(str);
    }
    
    /**
     * @dev Create a basic TXT record structure
     */
    function createTXTRecord(
        bytes memory dnsName,
        string memory content
    ) internal pure returns (bytes memory) {
        bytes memory txtData = bytes(content);
        
        return abi.encodePacked(
            dnsName,                    // DNS name
            uint16(16),                 // Type: TXT
            uint16(1),                  // Class: IN
            uint32(3600),               // TTL
            uint16(txtData.length + 1), // RDLENGTH (including length prefix)
            uint8(txtData.length),      // TXT length prefix
            txtData                     // TXT data
        );
    }
    
    /**
     * @dev Create TXT record with address format "a=0x..."
     */
    function createAddressTXTRecord(
        bytes memory dnsName,
        address addr
    ) internal pure returns (bytes memory) {
        string memory content = string(abi.encodePacked("a=0x", addressToString(addr)));
        return createTXTRecord(dnsName, content);
    }
    
    /**
     * @dev Create multiple TXT records concatenated
     */
    function createMultipleTXTRecords(
        bytes memory dnsName,
        string[] memory contents
    ) internal pure returns (bytes memory) {
        bytes memory result = "";
        
        for (uint i = 0; i < contents.length; i++) {
            result = abi.encodePacked(result, createTXTRecord(dnsName, contents[i]));
        }
        
        return result;
    }
}