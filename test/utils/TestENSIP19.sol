// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "../../contracts/utils/TestENSIP19.sol";

/**
 * @title TestENSIP19
 * @dev Tests for ENSIP-19 reverse resolution implementation
 */
contract TestENSIP19Test is BaseTest {
    TestENSIP19 public ensip19;

    uint256 constant COIN_TYPE_ETH = 60;
    uint256 constant EVM_BIT = 1 << 31;

    function _getTestAddresses() internal pure returns (bytes[] memory) {
        bytes[] memory addresses = new bytes[](3);
        addresses[0] = hex"81";
        addresses[1] = hex"8000000000000000000000000000000000000001";
        addresses[
            2
        ] = hex"800000000000000000000000000000000000000000000000000000000000000001"; // 33 bytes
        return addresses;
    }

    function _getCoinTypes() internal pure returns (uint256[] memory) {
        uint256[] memory types = new uint256[](6);
        types[0] = COIN_TYPE_ETH;
        types[1] = EVM_BIT;
        types[2] = 0; // btc
        types[3] = 0x123;
        types[4] = EVM_BIT | 1;
        types[5] = 0x1_8000_0123; // 33 bits
        return types;
    }

    function setUp() public override {
        super.setUp();
        ensip19 = new TestENSIP19();
    }

    function testReverseNameEmpty() public {
        // Should revert for empty address
        vm.expectRevert(abi.encodeWithSignature("EmptyAddress()"));
        ensip19.reverseName(hex"", COIN_TYPE_ETH);
    }

    function testReverseNameBasic() public view {
        // Test basic reverse name generation
        bytes memory addr = hex"81";
        string memory result = ensip19.reverseName(addr, COIN_TYPE_ETH);
        assertEq(
            result,
            "81.addr.reverse",
            "ETH reverse name should be correct"
        );
    }

    function testReverseNameEVM() public view {
        // Test EVM chain reverse name
        bytes memory addr = hex"81";
        string memory result = ensip19.reverseName(addr, EVM_BIT);
        assertEq(
            result,
            "81.default.reverse",
            "EVM reverse name should be correct"
        );
    }

    function testReverseNameCustomCoin() public view {
        // Test custom coin type reverse name
        bytes memory addr = hex"81";
        string memory result = ensip19.reverseName(addr, 0x123);
        assertEq(
            result,
            "81.123.reverse",
            "Custom coin reverse name should be correct"
        );
    }

    function testReverseNameLongAddress() public view {
        // Test with longer address
        bytes memory addr = hex"8000000000000000000000000000000000000001";
        string memory result = ensip19.reverseName(addr, COIN_TYPE_ETH);
        assertEq(
            result,
            "8000000000000000000000000000000000000001.addr.reverse",
            "Long address reverse name should be correct"
        );
    }

    function testParseReverseNameBasic() public view {
        // Test parsing reverse names back to address and coin type
        bytes memory encodedName = abi.encodePacked(
            uint8(2),
            "81",
            uint8(4),
            "addr",
            uint8(7),
            "reverse",
            uint8(0)
        );

        (bytes memory addr, uint256 coinType) = ensip19.parse(encodedName);
        assertEq(addr, hex"81", "Parsed address should match");
        assertEq(coinType, COIN_TYPE_ETH, "Parsed coin type should be ETH");
    }

    function testParseReverseNameEVM() public view {
        // Test parsing EVM reverse names
        bytes memory encodedName = abi.encodePacked(
            uint8(2),
            "81",
            uint8(7),
            "default",
            uint8(7),
            "reverse",
            uint8(0)
        );

        (bytes memory addr, uint256 coinType) = ensip19.parse(encodedName);
        assertEq(addr, hex"81", "Parsed address should match");
        assertEq(coinType, EVM_BIT, "Parsed coin type should be EVM_BIT");
    }

    function testParseInvalidNames() public view {
        // Test parsing invalid names returns zero values
        string[] memory invalidNames = new string[](9);
        invalidNames[0] = ""; // empty
        invalidNames[1] = "1234"; // only address
        invalidNames[2] = "zzz"; // only invalid address
        invalidNames[3] = "reverse"; // only tld
        invalidNames[4] = "zzz.addr.reverse"; // invalid address
        invalidNames[5] = ".default.reverse"; // empty address
        invalidNames[6] = "abc.reverse"; // no address
        invalidNames[7] = "1234.addr"; // no tld
        invalidNames[8] = "1234.addr.eth"; // invalid tld

        for (uint i = 0; i < invalidNames.length; i++) {
            bytes memory encodedName = _dnsEncodeName(invalidNames[i]);
            (bytes memory addr, uint256 coinType) = ensip19.parse(encodedName);
            assertEq(addr, hex"", "Invalid name should return empty address");
            assertEq(coinType, 0, "Invalid name should return zero coin type");
        }
    }

    function testChainFromCoinType() public view {
        // Test chain ID extraction from coin types
        assertEq(
            ensip19.chainFromCoinType(COIN_TYPE_ETH),
            1,
            "ETH should return chain 1"
        );
        assertEq(
            ensip19.chainFromCoinType(EVM_BIT),
            0,
            "EVM_BIT should return chain 0"
        );
        assertEq(ensip19.chainFromCoinType(0), 0, "BTC should return chain 0");
        assertEq(
            ensip19.chainFromCoinType(0x123),
            0,
            "Custom coin should return chain 0"
        );
        assertEq(
            ensip19.chainFromCoinType(EVM_BIT | 1),
            1,
            "EVM chain 1 should return chain 1"
        );
        assertEq(
            ensip19.chainFromCoinType(0x1_8000_0123),
            0,
            "33-bit coin should return chain 0"
        );
    }

    function testIsEVMCoinType() public view {
        // Test EVM coin type detection
        assertTrue(
            ensip19.isEVMCoinType(COIN_TYPE_ETH),
            "ETH should be EVM coin type"
        );
        assertTrue(
            ensip19.isEVMCoinType(EVM_BIT),
            "EVM_BIT should be EVM coin type"
        );
        assertFalse(
            ensip19.isEVMCoinType(0),
            "BTC should not be EVM coin type"
        );
        assertFalse(
            ensip19.isEVMCoinType(0x123),
            "Custom coin should not be EVM coin type"
        );
        assertTrue(
            ensip19.isEVMCoinType(EVM_BIT | 1),
            "EVM chain 1 should be EVM coin type"
        );
        assertFalse(
            ensip19.isEVMCoinType(0x1_8000_0123),
            "33-bit coin should not be EVM coin type"
        );
    }

    function testRoundTripConsistency() public view {
        // Test that parse(reverseName(a, c)) == (a, c)
        bytes[] memory testAddresses = _getTestAddresses();
        uint256[] memory coinTypes = _getCoinTypes();

        for (uint i = 0; i < testAddresses.length; i++) {
            for (uint j = 0; j < coinTypes.length; j++) {
                bytes memory addr = testAddresses[i];
                uint256 coinType = coinTypes[j];

                string memory reverseName = ensip19.reverseName(addr, coinType);
                bytes memory encodedName = _dnsEncodeName(reverseName);
                (bytes memory parsedAddr, uint256 parsedCoinType) = ensip19
                    .parse(encodedName);

                assertEq(parsedAddr, addr, "Round trip address should match");
                assertEq(
                    parsedCoinType,
                    coinType,
                    "Round trip coin type should match"
                );
            }
        }
    }

    // Helper function to DNS encode a name
    function _dnsEncodeName(
        string memory name
    ) internal pure returns (bytes memory) {
        bytes memory nameBytes = bytes(name);
        if (nameBytes.length == 0) {
            return abi.encodePacked(uint8(0));
        }

        // Simple DNS encoding - split by dots and encode each label
        bytes memory result = new bytes(nameBytes.length + 10); // Extra space for length bytes
        uint256 resultIndex = 0;
        uint256 labelStart = 0;

        for (uint256 i = 0; i <= nameBytes.length; i++) {
            if (i == nameBytes.length || nameBytes[i] == ".") {
                uint256 labelLength = i - labelStart;
                if (labelLength > 0) {
                    result[resultIndex++] = bytes1(uint8(labelLength));
                    for (uint256 j = labelStart; j < i; j++) {
                        result[resultIndex++] = nameBytes[j];
                    }
                }
                labelStart = i + 1;
            }
        }

        result[resultIndex++] = 0; // Null terminator

        // Resize to actual length
        bytes memory finalResult = new bytes(resultIndex);
        for (uint256 i = 0; i < resultIndex; i++) {
            finalResult[i] = result[i];
        }

        return finalResult;
    }
}
