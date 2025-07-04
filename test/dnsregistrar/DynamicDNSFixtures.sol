// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {DNSSEC} from "../../contracts/dnssec-oracle/DNSSEC.sol";
import "forge-std/Vm.sol";
import "../../contracts/utils/NameCoder.sol";

/**
 * @title DynamicDNSFixtures
 * @dev Dynamic DNS wire format fixtures that generate valid timestamps at runtime
 * Uses Node.js script to generate real DNS wire format from ensdomains/dnsprovejs
 */
library DynamicDNSFixtures {
    
    /**
     * @dev Create valid DNSSEC proof with current block timestamp
     */
    function createValidProof(string memory textType) 
        internal 
        returns (DNSSEC.RRSetWithSignature[] memory) 
    {
        // Get current block timestamp
        uint256 currentTime = block.timestamp;
        
        // Call Node.js script to generate wire format with current timestamp
        Vm vm = Vm(address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D)); // Foundry cheatcode address
        
        string[] memory inputs = new string[](4);
        inputs[0] = "node";
        inputs[1] = "scripts/generate_dns_fixtures.js";
        inputs[2] = vm.toString(currentTime);
        inputs[3] = textType;
        
        bytes memory result = vm.ffi(inputs);
        string memory hexData = string(result);
        
        // Parse the returned hex data (format: "rootHex,txtHex")
        (bytes memory rootHex, bytes memory txtHex) = parseHexPair(hexData);
        
        DNSSEC.RRSetWithSignature[] memory proof = new DNSSEC.RRSetWithSignature[](2);
        proof[0].rrset = rootHex;
        proof[0].sig = hex""; // Empty signature for DummyAlgorithm
        proof[1].rrset = txtHex;
        proof[1].sig = hex""; // Empty signature for DummyAlgorithm
        
        return proof;
    }
    
    /**
     * @dev Create proof with custom address
     */
    function createProofWithAddress(address addr) 
        internal 
        returns (DNSSEC.RRSetWithSignature[] memory) 
    {
        return createProofForDNSRegistrar("foo.test", addr, "valid");
    }
    
    /**
     * @dev Create DNSSEC proof for DNSRegistrar testing
     * @param dnsName The DNS name (e.g., "foo.test")
     * @param owner The address that should own the domain
     * @param proofType Type of proof: "valid", "stale-inception", "expired-sig", "empty"
     */
    function createProofForDNSRegistrar(
        string memory dnsName,
        address owner,
        string memory proofType
    ) internal returns (DNSSEC.RRSetWithSignature[] memory) {
        // Get current block timestamp
        uint256 currentTime = block.timestamp;
        
        // Call Node.js script to generate wire format with current timestamp
        Vm vm = Vm(address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D)); // Foundry cheatcode address
        
        string[] memory inputs = new string[](6);
        inputs[0] = "node";
        inputs[1] = "scripts/generate_dns_registrar_fixtures.js";
        inputs[2] = vm.toString(currentTime);
        inputs[3] = dnsName;
        inputs[4] = addressToHex(owner);
        inputs[5] = proofType;
        
        bytes memory result = vm.ffi(inputs);
        string memory hexData = string(result);
        
        // Handle empty proof case
        if (bytes(hexData).length == 0) {
            return new DNSSEC.RRSetWithSignature[](0);
        }
        
        // Parse the returned hex data (format: "rootHex,txtHex")
        (bytes memory rootHex, bytes memory txtHex) = parseHexPair(hexData);
        
        DNSSEC.RRSetWithSignature[] memory proof = new DNSSEC.RRSetWithSignature[](2);
        proof[0].rrset = rootHex;
        proof[0].sig = hex""; // Empty signature for DummyAlgorithm
        proof[1].rrset = txtHex;
        proof[1].sig = hex""; // Empty signature for DummyAlgorithm
        
        return proof;
    }
    
    /**
     * @dev Parse hex pair in format "0xAAA,0xBBB"
     */
    function parseHexPair(string memory data) internal pure returns (bytes memory first, bytes memory second) {
        bytes memory dataBytes = bytes(data);
        
        // Find comma separator
        uint256 commaPos = 0;
        for (uint256 i = 0; i < dataBytes.length; i++) {
            if (dataBytes[i] == ',') {
                commaPos = i;
                break;
            }
        }
        
        require(commaPos > 0, "Invalid hex pair format");
        
        // Extract first hex string
        bytes memory firstHex = new bytes(commaPos);
        for (uint256 i = 0; i < commaPos; i++) {
            firstHex[i] = dataBytes[i];
        }
        
        // Extract second hex string
        uint256 secondLength = dataBytes.length - commaPos - 1;
        bytes memory secondHex = new bytes(secondLength);
        for (uint256 i = 0; i < secondLength; i++) {
            secondHex[i] = dataBytes[commaPos + 1 + i];
        }
        
        // Convert hex strings to bytes
        first = hexStringToBytes(string(firstHex));
        second = hexStringToBytes(string(secondHex));
    }
    
    /**
     * @dev Convert hex string to bytes
     */
    function hexStringToBytes(string memory hexStr) internal pure returns (bytes memory) {
        bytes memory hexBytes = bytes(hexStr);
        
        // Remove '0x' prefix if present
        uint256 start = 0;
        if (hexBytes.length >= 2 && hexBytes[0] == '0' && hexBytes[1] == 'x') {
            start = 2;
        }
        
        uint256 len = (hexBytes.length - start) / 2;
        bytes memory result = new bytes(len);
        
        for (uint256 i = 0; i < len; i++) {
            uint256 bytePos = start + i * 2;
            uint8 high = hexCharToByte(hexBytes[bytePos]);
            uint8 low = hexCharToByte(hexBytes[bytePos + 1]);
            result[i] = bytes1((high << 4) | low);
        }
        
        return result;
    }
    
    /**
     * @dev Convert hex character to byte
     */
    function hexCharToByte(bytes1 char) internal pure returns (uint8) {
        uint8 c = uint8(char);
        if (c >= 48 && c <= 57) return c - 48; // 0-9
        if (c >= 65 && c <= 70) return c - 55; // A-F
        if (c >= 97 && c <= 102) return c - 87; // a-f
        revert("Invalid hex character");
    }
    
    /**
     * @dev DNS encode a domain name using NameCoder library
     */
    function dnsEncodeName(string memory name) internal pure returns (bytes memory) {
        return NameCoder.encode(name);
    }
    
    /**
     * @dev Convert address to hex string with 0x prefix
     */
    function addressToHex(address addr) internal pure returns (string memory) {
        bytes20 data = bytes20(addr);
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        
        str[0] = '0';
        str[1] = 'x';
        for (uint i = 0; i < 20; i++) {
            str[2+i*2] = alphabet[uint8(data[i] >> 4)];
            str[3+i*2] = alphabet[uint8(data[i] & 0x0f)];
        }
        
        return string(str);
    }
    
    /**
     * @dev Convert address to string (alias for addressToHex for compatibility)
     */
    function addressToString(address addr) internal pure returns (string memory) {
        return addressToHex(addr);
    }
}