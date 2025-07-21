// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnssec-oracle/algorithms/RSASHA1Algorithm.sol";
import "../../contracts/dnssec-oracle/algorithms/RSASHA256Algorithm.sol";
import "../../contracts/dnssec-oracle/algorithms/P256SHA256Algorithm.sol";

/**
 * @title TestAlgorithms
 * @dev Tests for DNSSEC signature algorithms using real test vectors
 */
contract TestAlgorithms is Test {
    // Test: RSASHA1Algorithm
    function testRSASHA1AlgorithmShouldReturnTrueForValidSignatures() public {
        RSASHA1Algorithm algorithm = new RSASHA1Algorithm();

        // Test vector generated from the org. zone using Python script
        // Real RSA-SHA1 signature from org. domain DNS records
        bytes
            memory publicKey = hex"01000307030100017c6c32637f260a4413d638b85351266ed0f460709846140ac0b1b8a960054f56ad010546bbc078c6a6501797e1213cb3757f4c493f4e01a63cfa74a4c90a0fb9ac7a5b8ae80addd8767a3b79cf0332f88bca72fd40d152660d482c707dd7e3516466701f47f8d29632c2680e10242c5aa0e474bb7f48f855bf7d59a736e0593b";
        bytes
            memory signedData = hex"00060701000003845af561bf5ad9a42f0746036f726700036f72670000060001000003840043026130036f72670b6166696c6961732d6e737404696e666f00036e6f630b6166696c6961732d6e737404696e666f0077fb3b8b000007080000038400093a8000015180";
        bytes
            memory signature = hex"34dcb335f5e6ef62a23ae2af91dfece7b930e1b6135f4c61e1004171adfa31b60e97b4a8aa88d039fad4426563ebf9214c03a1d98c31fd2ff608a4501216afb1d04b293dbd4e50f96a1cb30c742ed61c2f4ba640a9781a3ea7a25c9889a1d114164782456a69e378aeab0879e66cfa11e1aaa57eef5294370c20e07dade5a35f";

        bool result = algorithm.verify(publicKey, signedData, signature);
        assertTrue(result, "Valid RSA-SHA1 signature should verify");
    }

    function testRSASHA1AlgorithmShouldReturnFalseForInvalidSignatures()
        public
    {
        RSASHA1Algorithm algorithm = new RSASHA1Algorithm();

        bytes
            memory publicKey = hex"01000307030100017c6c32637f260a4413d638b85351266ed0f460709846140ac0b1b8a960054f56ad010546bbc078c6a6501797e1213cb3757f4c493f4e01a63cfa74a4c90a0fb9ac7a5b8ae80addd8767a3b79cf0332f88bca72fd40d152660d482c707dd7e3516466701f47f8d29632c2680e10242c5aa0e474bb7f48f855bf7d59a736e0593b";
        // Modify signed data by appending 00 to make it invalid
        bytes
            memory invalidSignedData = hex"00060701000003845af561bf5ad9a42f0746036f726700036f72670000060001000003840043026130036f72670b6166696c6961732d6e737404696e666f00036e6f630b6166696c6961732d6e737404696e666f0077fb3b8b000007080000038400093a800001518000";
        bytes
            memory signature = hex"34dcb335f5e6ef62a23ae2af91dfece7b930e1b6135f4c61e1004171adfa31b60e97b4a8aa88d039fad4426563ebf9214c03a1d98c31fd2ff608a4501216afb1d04b293dbd4e50f96a1cb30c742ed61c2f4ba640a9781a3ea7a25c9889a1d114164782456a69e378aeab0879e66cfa11e1aaa57eef5294370c20e07dade5a35f";

        bool result = algorithm.verify(publicKey, invalidSignedData, signature);
        assertFalse(result, "Invalid RSA-SHA1 signature should not verify");
    }

    // Test: RSASHA256Algorithm
    function testRSASHA256AlgorithmShouldReturnTrueForValidSignatures() public {
        RSASHA256Algorithm algorithm = new RSASHA256Algorithm();

        // Test vector generated from the example in RFC5702 using Python script
        // Real RSA-SHA256 signature from RFC5702 example
        bytes
            memory publicKey = hex"0100030803010001c15c1ac6b1c5d822bae1a60a45489b2e21f7d0aa4fb8f0637a5ec4f19c9d416d476161dfa069a27730b6467870082dbdde10b3c3e4c54769ea9fc395498e6dd9";
        bytes
            memory signedData = hex"0001080300000e1070dbd880386d43802349076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c000025b";
        bytes
            memory signature = hex"91108e1fabbb974406cbdaa90bd975b0b9dc25c38a14b27b1a18943a26eee2d798a79544f519dcae24a164dcfce66c2532034469c1582bf94fb4f89560fe1bc2";

        bool result = algorithm.verify(publicKey, signedData, signature);
        assertTrue(result, "Valid RSA-SHA256 signature should verify");
    }

    function testRSASHA256AlgorithmShouldReturnFalseForInvalidSignatures()
        public
    {
        RSASHA256Algorithm algorithm = new RSASHA256Algorithm();

        bytes
            memory publicKey = hex"0100030803010001c15c1ac6b1c5d822bae1a60a45489b2e21f7d0aa4fb8f0637a5ec4f19c9d416d476161dfa069a27730b6467870082dbdde10b3c3e4c54769ea9fc395498e6dd9";
        // Modify signed data by appending 00 to make it invalid
        bytes
            memory invalidSignedData = hex"0001080300000e1070dbd880386d43802349076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c000025b00";
        bytes
            memory signature = hex"91108e1fabbb974406cbdaa90bd975b0b9dc25c38a14b27b1a18943a26eee2d798a79544f519dcae24a164dcfce66c2532034469c1582bf94fb4f89560fe1bc2";

        bool result = algorithm.verify(publicKey, invalidSignedData, signature);
        assertFalse(result, "Invalid RSA-SHA256 signature should not verify");
    }

    // Test: P256SHA256Algorithm
    function testP256SHA256AlgorithmShouldReturnTrueForValidSignatures()
        public
    {
        P256SHA256Algorithm algorithm = new P256SHA256Algorithm();

        // Test vector generated from the example in RFC6605 using Python script
        // Real P256-SHA256 signature from RFC6605 example
        bytes
            memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        bytes
            memory signedData = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
        bytes
            memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

        bool result = algorithm.verify(publicKey, signedData, signature);
        assertTrue(result, "Valid P256-SHA256 signature should verify");
    }

    function testP256SHA256AlgorithmShouldReturnFalseForInvalidSignatures()
        public
    {
        P256SHA256Algorithm algorithm = new P256SHA256Algorithm();

        bytes
            memory publicKey = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
        // Modify signed data by appending 00 to make it invalid
        bytes
            memory invalidSignedData = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c000020100";
        bytes
            memory signature = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

        bool result = algorithm.verify(publicKey, invalidSignedData, signature);
        assertFalse(result, "Invalid P256-SHA256 signature should not verify");
    }
}
