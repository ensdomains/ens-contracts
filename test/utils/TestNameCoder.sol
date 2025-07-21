// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "../../contracts/utils/TestNameCoder.sol";

/**
 * @title TestNameCoder
 * @dev Tests for NameCoder library functionality (DNS encoding/decoding)
 */
contract TestNameCoderTest is BaseTest {
    TestNameCoder public nameCoder;

    function setUp() public override {
        super.setUp();

        // Deploy TestNameCoder contract
        nameCoder = new TestNameCoder();
    }

    function testEncodeEmpty() public view {
        // Test encoding empty string
        bytes memory result = nameCoder.encode("");
        assertEq(result, hex"00", "Empty string encoding failed");
    }

    function testEncodeSimple() public view {
        // Test encoding simple domain
        bytes memory result = nameCoder.encode("a");
        assertEq(
            result,
            hex"0161"
            hex"00",
            "Simple domain encoding failed"
        );
    }

    function testEncodeMultiLevel() public view {
        // Test encoding multi-level domain
        bytes memory result = nameCoder.encode("a.bb.ccc");
        // Expected: \x01a\x02bb\x03ccc\x00
        assertEq(
            result,
            hex"01610262620363636300",
            "Multi-level domain encoding failed"
        );
    }

    function testEncodeLongLabel() public view {
        // Test encoding domain with maximum label length (63 characters)
        string
            memory longLabel = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 63 chars
        assertEq(
            bytes(longLabel).length,
            63,
            "Long label should be 63 characters"
        );

        bytes memory result = nameCoder.encode(longLabel);
        // Should start with 0x3f (63 in hex) followed by the label and null terminator
        bytes memory expected = abi.encodePacked(
            uint8(63),
            longLabel,
            uint8(0)
        );
        assertEq(result, expected, "Long label encoding failed");
    }

    function testDecodeEmpty() public view {
        // Test decoding empty DNS name (just null terminator)
        string memory result = nameCoder.decode(hex"00");
        assertEq(result, "", "Empty DNS name decoding failed");
    }

    function testDecodeSimple() public view {
        // Test decoding simple DNS name
        string memory result = nameCoder.decode(
            hex"0161"
            hex"00"
        );
        assertEq(result, "a", "Simple DNS name decoding failed");
    }

    function testDecodeMultiLevel() public view {
        // Test decoding multi-level DNS name
        string memory result = nameCoder.decode(hex"01610262620363636300");
        assertEq(result, "a.bb.ccc", "Multi-level DNS name decoding failed");
    }

    function testNamehashEmpty() public view {
        // Test namehash of empty string
        bytes32 result = nameCoder.namehash(hex"00", 0);
        assertEq(result, bytes32(0), "Empty namehash failed");
    }

    function testNamehashSimple() public view {
        // Test namehash of simple domain
        bytes memory encoded = nameCoder.encode("eth");
        bytes32 result = nameCoder.namehash(encoded, 0);
        bytes32 expected = namehash("eth");
        assertEq(result, expected, "Simple namehash failed");
    }

    function testNamehashMultiLevel() public view {
        // Test namehash of multi-level domain
        bytes memory encoded = nameCoder.encode("test.eth");
        bytes32 result = nameCoder.namehash(encoded, 0);
        bytes32 expected = namehash("test.eth");
        assertEq(result, expected, "Multi-level namehash failed");
    }

    function testNamehashWithOffset() public view {
        // Test namehash with different starting positions (parent domains)
        bytes memory encoded = nameCoder.encode("sub.test.eth");

        // Full domain
        bytes32 result1 = nameCoder.namehash(encoded, 0);
        assertEq(
            result1,
            namehash("sub.test.eth"),
            "Full domain namehash failed"
        );

        // Parent domain (test.eth)
        bytes32 result2 = nameCoder.namehash(encoded, 4); // Skip "sub" label (1 + 3 bytes)
        assertEq(
            result2,
            namehash("test.eth"),
            "Parent domain namehash failed"
        );

        // Root domain (eth)
        bytes32 result3 = nameCoder.namehash(encoded, 9); // Skip "sub.test" (1+3+1+4 bytes)
        assertEq(result3, namehash("eth"), "Root domain namehash failed");
    }

    function testEncodeFailureInvalidDomains() public {
        // Test encoding invalid domains that should fail

        // Domain starting with dot
        vm.expectRevert(
            abi.encodeWithSignature("DNSEncodingFailed(string)", ".a")
        );
        nameCoder.encode(".a");

        // Domain ending with dot
        vm.expectRevert(
            abi.encodeWithSignature("DNSEncodingFailed(string)", "a.")
        );
        nameCoder.encode("a.");

        // Domain with consecutive dots
        vm.expectRevert(
            abi.encodeWithSignature("DNSEncodingFailed(string)", "a..b")
        );
        nameCoder.encode("a..b");

        // Just a dot
        vm.expectRevert(
            abi.encodeWithSignature("DNSEncodingFailed(string)", ".")
        );
        nameCoder.encode(".");

        // Multiple dots
        vm.expectRevert(
            abi.encodeWithSignature("DNSEncodingFailed(string)", "..")
        );
        nameCoder.encode("..");
    }

    function testDecodeFailureInvalidData() public {
        // Test decoding invalid DNS data that should fail

        // Empty data
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"")
        );
        nameCoder.decode(hex"");

        // Incomplete length prefix
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"02")
        );
        nameCoder.decode(hex"02");

        // Invalid length (claims 16 bytes but only has 0)
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"1000")
        );
        nameCoder.decode(hex"1000");

        // Missing null terminator
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"0161")
        );
        nameCoder.decode(hex"0161");
    }

    function testNamehashFailureInvalidData() public {
        // Test namehash with invalid DNS data

        // Empty data
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"")
        );
        nameCoder.namehash(hex"", 0);

        // Incomplete data
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"02")
        );
        nameCoder.namehash(hex"02", 0);

        // Invalid offset
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"016100")
        );
        nameCoder.namehash(
            hex"0161"
            hex"00",
            5
        );
    }

    function testMaliciousLabel() public {
        // Test decoding with malicious label containing dots
        vm.expectRevert(
            abi.encodeWithSignature("DNSDecodingFailed(bytes)", hex"03612e6200")
        );
        nameCoder.decode(hex"03612e6200"); // "\x03a.b\x00"
    }

    function testRoundTrip() public view {
        // Test encoding then decoding produces original string
        string memory original = "test.example.eth";
        bytes memory encoded = nameCoder.encode(original);
        string memory decoded = nameCoder.decode(encoded);
        assertEq(decoded, original, "Round trip failed");
    }

    function testRoundTripComplexDomain() public view {
        // Test with more complex domain
        string memory original = "my-subdomain.test-domain.co.uk";
        bytes memory encoded = nameCoder.encode(original);
        string memory decoded = nameCoder.decode(encoded);
        assertEq(decoded, original, "Complex domain round trip failed");
    }
}
