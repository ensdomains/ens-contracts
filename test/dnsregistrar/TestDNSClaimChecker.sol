// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/DNSClaimChecker.sol";
import "../../contracts/dnssec-oracle/RRUtils.sol";
import "../../contracts/utils/BytesUtils.sol";
import "./DNSTestUtils.sol";

/**
 * @title TestDNSClaimChecker
 * @dev Tests for DNSClaimChecker library
 */
contract TestDNSClaimChecker is Test {
    using BytesUtils for bytes;

    /**
     * @dev Test successful address extraction from valid TXT record
     * Tests: getOwnerAddress (success), parseRR (success), parseString (success)
     */
    function testGetOwnerAddressSuccess() public pure {
        address expectedAddr = 0x1234567890123456789012345678901234567890;
        
        // Create DNS name: test.example
        bytes memory dnsName = DNSTestUtils.encodeDNSName("test.example");
        
        // Create RRSet data with _ens.test.example TXT record containing "a=0x1234567890123456789012345678901234567890"
        bytes memory rdata = createValidTXTRecord(expectedAddr);
        
        (address foundAddr, bool found) = DNSClaimChecker.getOwnerAddress(dnsName, rdata);
        
        assertTrue(found, "Should find owner address");
        assertEq(foundAddr, expectedAddr, "Should return correct address");
    }
    
    /**
     * @dev Test failure when no matching TXT record is found
     * Tests: getOwnerAddress (no match), parseRR (no match)
     */
    function testGetOwnerAddressNoMatch() public pure {
        // Create DNS name: test.example  
        bytes memory dnsName = DNSTestUtils.encodeDNSName("test.example");
        
        // Create RRSet data with wrong.example TXT record (name doesn't match)
        bytes memory rdata = createMismatchedTXTRecord();
        
        (address foundAddr, bool found) = DNSClaimChecker.getOwnerAddress(dnsName, rdata);
        
        assertFalse(found, "Should not find owner address");
        assertEq(foundAddr, address(0), "Should return zero address");
    }
    
    /**
     * @dev Test failure when TXT record exists but has invalid format
     * Tests: parseString (invalid format)
     */
    function testGetOwnerAddressInvalidFormat() public pure {
        // Create DNS name: test.example
        bytes memory dnsName = DNSTestUtils.encodeDNSName("test.example");
        
        // Create RRSet data with _ens.test.example TXT record containing invalid format
        bytes memory rdata = createInvalidFormatTXTRecord();
        
        (address foundAddr, bool found) = DNSClaimChecker.getOwnerAddress(dnsName, rdata);
        
        assertFalse(found, "Should not find owner address with invalid format");
        assertEq(foundAddr, address(0), "Should return zero address");
    }
    
    /**
     * @dev Test parsing multiple TXT records, finding valid one among invalid ones
     * Tests: parseRR iteration, parseString with multiple attempts
     */
    function testGetOwnerAddressMultipleRecords() public pure {
        address expectedAddr = 0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD;
        
        // Create DNS name: test.example
        bytes memory dnsName = DNSTestUtils.encodeDNSName("test.example");
        
        // Create RRSet data with multiple TXT records - valid one in the middle
        bytes memory rdata = createMultipleTXTRecords(expectedAddr);
        
        (address foundAddr, bool found) = DNSClaimChecker.getOwnerAddress(dnsName, rdata);
        
        assertTrue(found, "Should find owner address among multiple records");
        assertEq(foundAddr, expectedAddr, "Should return correct address from valid record");
    }
    
    /**
     * @dev Test parseString with exact "a=0x" prefix requirement
     * Tests: parseString edge case validation
     */
    function testParseStringPrefixValidation() public pure {
        // Test valid prefix
        bytes memory validStr = "a=0x1234567890123456789012345678901234567890";
        (address addr, bool found) = DNSClaimChecker.parseString(validStr, 0, validStr.length);
        assertTrue(found, "Should parse valid string");
        assertEq(addr, 0x1234567890123456789012345678901234567890, "Should return correct address");
        
        // Test invalid prefixes
        bytes memory invalidStr1 = "b=0x1234567890123456789012345678901234567890"; // wrong first char
        (addr, found) = DNSClaimChecker.parseString(invalidStr1, 0, invalidStr1.length);
        assertFalse(found, "Should reject invalid prefix");
        
        bytes memory invalidStr2 = "a=1234567890123456789012345678901234567890"; // missing 0x
        (addr, found) = DNSClaimChecker.parseString(invalidStr2, 0, invalidStr2.length);
        assertFalse(found, "Should reject string without 0x");
        
        bytes memory invalidStr3 = "addr=0x1234567890123456789012345678901234567890"; // wrong prefix
        (addr, found) = DNSClaimChecker.parseString(invalidStr3, 0, invalidStr3.length);
        assertFalse(found, "Should reject wrong prefix");
    }
    
    /**
     * @dev Test empty RRSet data
     * Tests: getOwnerAddress with empty data
     */
    function testGetOwnerAddressEmptyData() public pure {
        bytes memory dnsName = DNSTestUtils.encodeDNSName("test.example");
        bytes memory emptyData = "";
        
        (address foundAddr, bool found) = DNSClaimChecker.getOwnerAddress(dnsName, emptyData);
        
        assertFalse(found, "Should not find address in empty data");
        assertEq(foundAddr, address(0), "Should return zero address");
    }

    // Helper functions for creating test data using library
    
    function createValidTXTRecord(address addr) internal pure returns (bytes memory) {
        bytes memory ensName = DNSTestUtils.encodeDNSName("_ens.test.example");
        return DNSTestUtils.createAddressTXTRecord(ensName, addr);
    }
    
    function createMismatchedTXTRecord() internal pure returns (bytes memory) {
        bytes memory wrongName = DNSTestUtils.encodeDNSName("wrong.example");
        return DNSTestUtils.createTXTRecord(wrongName, "a=0x1234567890123456789012345678901234567890");
    }
    
    function createInvalidFormatTXTRecord() internal pure returns (bytes memory) {
        bytes memory ensName = DNSTestUtils.encodeDNSName("_ens.test.example");
        return DNSTestUtils.createTXTRecord(ensName, "invalid-format-not-address");
    }
    
    function createMultipleTXTRecords(address validAddr) internal pure returns (bytes memory) {
        bytes memory ensName = DNSTestUtils.encodeDNSName("_ens.test.example");
        
        string[] memory contents = new string[](3);
        contents[0] = "invalid-first-record";
        contents[1] = string(abi.encodePacked("a=0x", DNSTestUtils.addressToString(validAddr)));
        contents[2] = "b=0x9999999999999999999999999999999999999999";
        
        return DNSTestUtils.createMultipleTXTRecords(ensName, contents);
    }
}