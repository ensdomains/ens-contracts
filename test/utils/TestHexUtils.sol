// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "../../contracts/utils/TestHexUtils.sol";

/**
 * @title TestHexUtils
 * @dev Tests for HexUtils library functionality
 */
contract TestHexUtilsTest is BaseTest {
    TestHexUtils public hexUtils;

    function setUp() public override {
        super.setUp();

        // Deploy TestHexUtils contract
        hexUtils = new TestHexUtils();
    }

    function testHexToBytes() public view {
        // Test hexToBytes with various lengths

        // Test empty string
        (bytes memory result, bool valid) = hexUtils.hexToBytes(hex"", 0, 0);
        assertEq(result, hex"", "Empty hex string failed");
        assertTrue(valid, "Empty hex string should be valid");

        // Test single character (odd length gets padded)
        (result, valid) = hexUtils.hexToBytes(bytes("a"), 0, 1);
        assertEq(result, hex"0a", "Single character hex failed");
        assertTrue(valid, "Single character hex should be valid");

        // Test even length string
        (result, valid) = hexUtils.hexToBytes(bytes("abcd"), 0, 4);
        assertEq(result, hex"abcd", "Even length hex failed");
        assertTrue(valid, "Even length hex should be valid");
    }

    function testHexStringToBytes32() public view {
        // Test valid 64-character hex string
        (bytes32 result, bool valid) = hexUtils.hexStringToBytes32(
            bytes(
                "5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da"
            ),
            0,
            64
        );
        assertEq(
            result,
            0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da,
            "Valid bytes32 conversion failed"
        );
        assertTrue(valid, "Valid bytes32 should be valid");

        // Test shorter string (gets padded with zeros)
        (result, valid) = hexUtils.hexStringToBytes32(bytes("abcd"), 0, 4);
        assertEq(
            result,
            0x000000000000000000000000000000000000000000000000000000000000abcd,
            "Short hex padding failed"
        );
        assertTrue(valid, "Short hex should be valid");

        // Test invalid character
        (result, valid) = hexUtils.hexStringToBytes32(
            bytes(
                "zcee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da"
            ),
            0,
            64
        );
        assertEq(result, bytes32(0), "Invalid character should return zero");
        assertFalse(valid, "Invalid character should be invalid");
    }

    function testHexToAddress() public view {
        // Test valid address conversion
        (address result, bool valid) = hexUtils.hexToAddress(
            bytes(
                "5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da"
            ),
            0,
            40
        );
        assertEq(
            result,
            0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F,
            "Valid address conversion failed"
        );
        assertTrue(valid, "Valid address should be valid");

        // Test string too short (less than 40 characters)
        (result, valid) = hexUtils.hexToAddress(
            bytes(
                "5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da"
            ),
            0,
            39
        );
        assertEq(result, address(0), "Too short address should return zero");
        assertFalse(valid, "Too short address should be invalid");
    }

    function testAddressToHex() public view {
        // Test zero address
        string memory result = hexUtils.addressToHex(address(0));
        assertEq(
            result,
            "0000000000000000000000000000000000000000",
            "Zero address conversion failed"
        );

        // Test specific address
        result = hexUtils.addressToHex(
            0x5ceE339e13375638553bdF5a6e36BA80fB9f6a4F
        );
        assertEq(
            result,
            "5cee339e13375638553bdf5a6e36ba80fb9f6a4f",
            "Address conversion failed"
        );
    }

    function testBytesToHex() public view {
        // Test empty bytes
        string memory result = hexUtils.bytesToHex("");
        assertEq(result, "", "Empty bytes conversion failed");

        // Test single byte
        result = hexUtils.bytesToHex(hex"ff");
        assertEq(result, "ff", "Single byte conversion failed");

        // Test multiple bytes
        result = hexUtils.bytesToHex(hex"deadbeef");
        assertEq(result, "deadbeef", "Multiple bytes conversion failed");
    }

    function testUnpaddedUintToHex() public view {
        // Test zero
        string memory result = hexUtils.unpaddedUintToHex(0, true);
        assertEq(result, "0", "Zero conversion failed");

        // Test small number with padding
        result = hexUtils.unpaddedUintToHex(15, false);
        assertEq(result, "0f", "Small number with padding failed");

        // Test small number without padding
        result = hexUtils.unpaddedUintToHex(15, true);
        assertEq(result, "f", "Small number without padding failed");

        // Test larger number
        result = hexUtils.unpaddedUintToHex(255, true);
        assertEq(result, "ff", "Larger number conversion failed");
    }
}
