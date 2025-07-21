// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "contracts/test/TestBytesUtils.sol";
import "contracts/test/TestRRUtils.sol";
import "../../contracts/utils/BytesUtils.sol";
import "../../contracts/dnssec-oracle/RRUtils.sol";

/**
 * @title TestSolidityTests
 * @dev Tests using existing Solidity test contracts for BytesUtils and RRUtils
 */
contract TestSolidityTests is Test {
    using BytesUtils for bytes;
    using RRUtils for bytes;

    TestBytesUtils public testBytesUtils;
    TestRRUtils public testRRUtils;

    function setUp() public {
        testBytesUtils = new TestBytesUtils();
        testRRUtils = new TestRRUtils();
    }

    // BytesUtils Tests
    function testBytesUtilsKeccak() public {
        testBytesUtils.testKeccak();
    }

    function testBytesUtilsEquals() public {
        testBytesUtils.testEquals();
    }

    function testBytesUtilsComparePartial() public {
        testBytesUtils.testComparePartial();
    }

    function testBytesUtilsCompare() public {
        testBytesUtils.testCompare();
    }

    function testBytesUtilsSubstring() public {
        testBytesUtils.testSubstring();
    }

    function testBytesUtilsReadUint8() public {
        testBytesUtils.testReadUint8();
    }

    function testBytesUtilsReadUint16() public {
        testBytesUtils.testReadUint16();
    }

    function testBytesUtilsReadUint32() public {
        testBytesUtils.testReadUint32();
    }

    function testBytesUtilsReadBytes20() public {
        testBytesUtils.testReadBytes20();
    }

    function testBytesUtilsReadBytes32() public {
        testBytesUtils.testReadBytes32();
    }

    function testBytesUtilsBase32HexDecodeWord() public {
        testBytesUtils.testBase32HexDecodeWord();
    }

    // RRUtils Tests
    function testRRUtilsNameLength() public {
        testRRUtils.testNameLength();
    }

    function testRRUtilsLabelCount() public {
        testRRUtils.testLabelCount();
    }

    function testRRUtilsIterateRRs() public {
        testRRUtils.testIterateRRs();
    }

    function testRRUtilsCompareNames() public {
        testRRUtils.testCompareNames();
    }

    function testRRUtilsSerialNumberGt() public {
        testRRUtils.testSerialNumberGt();
    }

    function testRRUtilsKeyTag() public {
        testRRUtils.testKeyTag();
    }

    // Additional tests
    function testAllBytesUtilsFunctions() public {
        // Run all BytesUtils tests in sequence
        testBytesUtils.testKeccak();
        testBytesUtils.testEquals();
        testBytesUtils.testComparePartial();
        testBytesUtils.testCompare();
        testBytesUtils.testSubstring();
        testBytesUtils.testReadUint8();
        testBytesUtils.testReadUint16();
        testBytesUtils.testReadUint32();
        testBytesUtils.testReadBytes20();
        testBytesUtils.testReadBytes32();
        testBytesUtils.testBase32HexDecodeWord();
    }

    function testAllRRUtilsFunctions() public {
        // Run all RRUtils tests in sequence
        testRRUtils.testNameLength();
        testRRUtils.testLabelCount();
        testRRUtils.testIterateRRs();
        testRRUtils.testCompareNames();
        testRRUtils.testSerialNumberGt();
        testRRUtils.testKeyTag();
    }

    function testSolidityTestContractsExist() public {
        // Basic sanity check that contracts are deployed
        assertTrue(
            address(testBytesUtils) != address(0),
            "TestBytesUtils should be deployed"
        );
        assertTrue(
            address(testRRUtils) != address(0),
            "TestRRUtils should be deployed"
        );
    }

    // Test individual utility functions manually to ensure they work
    function testBytesUtilsManual() public {
        // Test some BytesUtils functionality manually

        // Test string equality
        assertTrue(
            bytes("hello").equals("hello"),
            "String equality should work"
        );
        assertFalse(
            bytes("hello").equals("world"),
            "String inequality should work"
        );

        // Test substring
        bytes memory hello = "hello";
        bytes memory ell = hello.substring(1, 3);
        assertTrue(ell.equals("ell"), "Substring should work");

        // Test readUint8
        bytes memory testBytes = "abc";
        uint8 firstByte = testBytes.readUint8(0);
        assertEq(firstByte, 0x61, "First byte should be 'a' (0x61)");
    }

    function testRRUtilsManual() public {
        // Test name length calculation
        bytes memory emptyName = hex"00";
        uint256 nameLen = emptyName.nameLength(0);
        assertEq(nameLen, 1, "Empty name (root) should have length 1");

        // Test label count
        bytes memory singleLabel = hex"016100"; // "a."
        uint256 labelCnt = singleLabel.labelCount(0);
        assertEq(labelCnt, 1, "Single label should have count 1");

        // Test serial number comparison
        assertTrue(RRUtils.serialNumberGte(1, 0), "1 should be >= 0");
        assertTrue(RRUtils.serialNumberGte(1, 1), "1 should be >= 1");
        assertFalse(RRUtils.serialNumberGte(0, 1), "0 should not be >= 1");
    }

    function testBytesUtilsEdgeCases() public {
        // Test empty string operations
        bytes memory empty = "";
        assertTrue(empty.equals(""), "Empty strings should be equal");
        assertEq(
            empty.substring(0, 0).length,
            0,
            "Empty substring should have length 0"
        );

        // Test single character operations
        bytes memory singleChar = "a";
        assertTrue(singleChar.equals("a"), "Single char equality");
        assertEq(
            singleChar.readUint8(0),
            0x61,
            "Single char should read correctly"
        );

        // Test long string operations
        bytes memory longString = "abcdefghijklmnopqrstuvwxyz";
        assertTrue(
            longString.equals("abcdefghijklmnopqrstuvwxyz"),
            "Long string equality"
        );
        assertEq(
            longString.substring(0, 3).length,
            3,
            "Long string substring length"
        );
    }

    function testRRUtilsEdgeCases() public {
        // Test root domain (empty label)
        bytes memory root = hex"00";
        assertEq(root.nameLength(0), 1, "Root domain name length");
        assertEq(root.labelCount(0), 0, "Root domain label count");

        // Test multi-label names
        bytes memory multiLabel = hex"016201610000"; // "b.a."
        assertEq(
            multiLabel.labelCount(0),
            2,
            "Multi-label should have correct count"
        );

        // Test serial number edge cases
        assertTrue(
            RRUtils.serialNumberGte(0, 0xFFFFFFFF),
            "0 >= 0xFFFFFFFF (wraparound)"
        );
        assertFalse(
            RRUtils.serialNumberGte(0xFFFFFFFF, 0),
            "0xFFFFFFFF should not be >= 0"
        );
    }
}
