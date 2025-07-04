// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnssec-oracle/digests/SHA1Digest.sol";
import "../../contracts/dnssec-oracle/digests/SHA256Digest.sol";

/**
 * @title TestDigests
 * @dev Tests for DNSSEC digest algorithms
 */
contract TestDigests is Test {
    SHA1Digest public sha1Digest;
    SHA256Digest public sha256Digest;
    
    function setUp() public {
        sha1Digest = new SHA1Digest();
        sha256Digest = new SHA256Digest();
    }
    
    function testSHA1DigestValidHash() public view {
        // Test SHA1 digest verification with known test vector
        // Data: "hello world"
        bytes memory data = "hello world";
        // Expected SHA1: 0x2aae6c35c94fcfb415dbe95f408b9ce91ee846ed
        bytes memory expectedHash = hex"2aae6c35c94fcfb415dbe95f408b9ce91ee846ed";
        
        assertTrue(sha1Digest.verify(data, expectedHash), "SHA1 digest should verify correctly");
    }
    
    function testSHA1DigestInvalidHash() public view {
        // Test SHA1 digest verification with incorrect hash
        bytes memory data = "hello world";
        bytes memory wrongHash = hex"deadbeefcafebabe123456789abcdef012345678";
        
        assertFalse(sha1Digest.verify(data, wrongHash), "SHA1 digest should reject incorrect hash");
    }
    
    function testSHA1DigestWrongLength() public {
        // Test SHA1 digest with wrong length hash (SHA1 must be 20 bytes)
        bytes memory data = "test";
        bytes memory shortHash = hex"deadbeef"; // Only 4 bytes
        
        vm.expectRevert("Invalid sha1 hash length");
        sha1Digest.verify(data, shortHash);
    }
    
    function testSHA256DigestValidHash() public view {
        // Test SHA256 digest verification with known test vector
        // Data: "hello world"
        bytes memory data = "hello world";
        // Expected SHA256: 0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
        bytes memory expectedHash = hex"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        
        assertTrue(sha256Digest.verify(data, expectedHash), "SHA256 digest should verify correctly");
    }
    
    function testSHA256DigestInvalidHash() public view {
        // Test SHA256 digest verification with incorrect hash
        bytes memory data = "hello world";
        bytes memory wrongHash = hex"deadbeefcafebabe123456789abcdef0123456789abcdef0deadbeefcafebabe";
        
        assertFalse(sha256Digest.verify(data, wrongHash), "SHA256 digest should reject incorrect hash");
    }
    
    function testSHA256DigestWrongLength() public {
        // Test SHA256 digest with wrong length hash (SHA256 must be 32 bytes)
        bytes memory data = "test";
        bytes memory shortHash = hex"deadbeefcafebabe"; // Only 8 bytes
        
        vm.expectRevert("Invalid sha256 hash length");
        sha256Digest.verify(data, shortHash);
    }
    
    function testEmptyDataSHA1() public view {
        // Test SHA1 of empty data
        bytes memory emptyData = "";
        // SHA1 of empty string: 0xda39a3ee5e6b4b0d3255bfef95601890afd80709
        bytes memory expectedHash = hex"da39a3ee5e6b4b0d3255bfef95601890afd80709";
        
        assertTrue(sha1Digest.verify(emptyData, expectedHash), "SHA1 of empty data should verify");
    }
    
    function testEmptyDataSHA256() public view {
        // Test SHA256 of empty data
        bytes memory emptyData = "";
        // SHA256 of empty string: 0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        bytes memory expectedHash = hex"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        
        assertTrue(sha256Digest.verify(emptyData, expectedHash), "SHA256 of empty data should verify");
    }
    
    function testLargeDataSHA256() public view {
        // Test SHA256 with larger data
        bytes memory largeData = "The quick brown fox jumps over the lazy dog";
        // Expected SHA256 for this string
        bytes memory expectedHash = hex"d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592";
        
        assertTrue(sha256Digest.verify(largeData, expectedHash), "SHA256 of large data should verify");
    }
    
    function testDNSKeyDataSHA256() public view {
        // Test with DNS-like data (simulated DNSKEY record data)
        // This simulates hashing keyname + DNSKEY RDATA for DS record validation
        bytes memory dnskeyData = hex"03666f6f03636f6d000100010803010001a8b5a4c8b2e75c8e5f1234567890abcdef";
        
        // Calculate expected hash
        bytes32 calculatedHash = sha256(dnskeyData);
        bytes memory expectedHash = abi.encodePacked(calculatedHash);
        
        assertTrue(sha256Digest.verify(dnskeyData, expectedHash), "DNS key data SHA256 should verify");
    }
}