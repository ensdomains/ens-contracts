// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnssec-oracle/algorithms/P256SHA256Algorithm.sol";

/**
 * @title TestP256SHA256Algorithm
 * @dev P256SHA256Algorithm tests
 * Uses real RFC 6605 test vectors for DNSSEC P-256 signature verification
 */
contract TestP256SHA256Algorithm is Test {
    
    P256SHA256Algorithm public algorithm;
    
    function setUp() public {
        algorithm = new P256SHA256Algorithm();
    }
    
    /**
     * Test 1: "should return true for valid signatures"
     * Uses real RFC 6605 test vector for P256SHA256Algorithm
     */
    function testShouldReturnTrueForValidSignatures() public view {
        // Real test vector from RFC 6605
        // example.net. 3600 IN DNSKEY 257 3 13 (
        //         GojIhhXUN/u4v54ZQqGSnyhWJwaubCvTmeexv7bR6edb
        //         krSqQpF64cYbcB7wNcP+e+MAnLr+Wi9xMWyQLc8NAA== )
        bytes memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        
        // www.example.net. 3600 IN A 192.0.2.1
        bytes memory signedData = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
        
        //  www.example.net. 3600 IN RRSIG A 13 3 3600 (
        //               20100909100439 20100812100439 55648 example.net.
        //               qx6wLYqmh+l9oCKTN6qIc+bw6ya+KJ8oMz0YP107epXA
        //               yGmt+3SNruPFKG7tZoLBLlUzGGus7ZwmwWep666VCw== )
        bytes memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
        
        bool result = algorithm.verify(publicKey, signedData, signature);
        assertTrue(result, "P256SHA256Algorithm should verify valid RFC 6605 test vector");
    }
    
    /**
     * Test 2: "should return false for invalid signatures"
     * Tests rejection of invalid signature
     */
    function testShouldReturnFalseForInvalidSignatures() public view {
        // Use same public key and signed data from valid test
        bytes memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        bytes memory signedData = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
        
        // Invalid signature - modified from valid one (changes last bytes to make it invalid while keeping 64-byte length)
        bytes memory invalidSignature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae95ff";
        
        bool result = algorithm.verify(publicKey, signedData, invalidSignature);
        assertFalse(result, "P256SHA256Algorithm should reject invalid signature");
    }
    
    /**
     * Additional Test: Test parseSignature function
     * Verifies correct parsing of P-256 signature format
     */
    function testParseSignatureValidLength() public {
        // Valid 64-byte P-256 signature
        bytes memory validSignature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
        
        // This should not revert
        bytes memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        bytes memory signedData = "test";
        
        // Should handle valid signature length without reverting
        algorithm.verify(publicKey, signedData, validSignature);
        // Test passes if no revert occurs - result can be true or false
        assertTrue(true, "Valid signature length should not cause revert");
    }
    
    /**
     * Additional Test: Test parseSignature with invalid length
     * Should revert with "Invalid p256 signature length"
     */
    function testParseSignatureInvalidLength() public {
        // Invalid signature length (not 64 bytes)
        bytes memory invalidSignature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b00ff"; // 65 bytes
        
        bytes memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        bytes memory signedData = "test";
        
        vm.expectRevert("Invalid p256 signature length");
        algorithm.verify(publicKey, signedData, invalidSignature);
    }
    
    /**
     * Additional Test: Test parseKey function
     * Verifies correct parsing of P-256 public key format
     */
    function testParseKeyValidLength() public {
        // Valid 68-byte P-256 public key (from RFC test vector)
        bytes memory validKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        
        bytes memory signedData = "test";
        bytes memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
        
        // Should handle valid key length without reverting
        algorithm.verify(validKey, signedData, signature);
        // Test passes if no revert occurs - result can be true or false
        assertTrue(true, "Valid key length should not cause revert");
    }
    
    /**
     * Additional Test: Test parseKey with invalid length
     * Should revert with "Invalid p256 key length"
     */
    function testParseKeyInvalidLength() public {
        // Invalid key length (not 68 bytes)
        bytes memory invalidKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d0000"; // 69 bytes
        
        bytes memory signedData = "test";
        bytes memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
        
        vm.expectRevert("Invalid p256 key length");
        algorithm.verify(invalidKey, signedData, signature);
    }
    
    /**
     * Additional Test: Test with empty data
     * Should handle empty signed data gracefully
     */
    function testVerifyWithEmptyData() public view {
        bytes memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        bytes memory emptyData = hex"";
        bytes memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
        
        // Should not revert with empty data (will likely return false)
        bool result = algorithm.verify(publicKey, emptyData, signature);
        // Don't assert the result since empty data is edge case behavior
        console.log("Empty data verification result:", result);
    }
    
    /**
     * Additional Test: Test with all zero signature
     * Should reject all-zero signature
     */
    function testVerifyWithZeroSignature() public view {
        bytes memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        bytes memory signedData = "test";
        bytes memory zeroSignature = hex"00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        
        bool result = algorithm.verify(publicKey, signedData, zeroSignature);
        assertFalse(result, "All-zero signature should be rejected");
    }
    
    /**
     * Additional Test: Test with corrupted public key
     * Should handle corrupted key gracefully (likely return false)
     */
    function testVerifyWithCorruptedKey() public view {
        // Corrupted key (all zeros except length header)
        bytes memory corruptedKey = hex"0101030d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        bytes memory signedData = "test";
        bytes memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
        
        // Should not revert but likely return false
        bool result = algorithm.verify(corruptedKey, signedData, signature);
        assertFalse(result, "Corrupted public key should be rejected");
    }
}
