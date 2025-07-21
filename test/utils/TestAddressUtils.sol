// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/utils/AddressUtils.sol";

/**
 * @title TestAddressUtils
 * @dev Tests for AddressUtils library - optimized SHA3 hashing of hexadecimal address representation
 */
contract TestAddressUtils is Test {
    using AddressUtils for address;

    function testSha3HexAddressZeroAddress() public pure {
        address zeroAddr = address(0);
        bytes32 result = zeroAddr.sha3HexAddress();

        // Expected: keccak256("0000000000000000000000000000000000000000")
        bytes32 expected = keccak256(
            "0000000000000000000000000000000000000000"
        );
        assertEq(result, expected, "Should hash zero address correctly");
    }

    function testSha3HexAddressKnownAddress() public pure {
        // Use a well-known address
        address addr = address(0x1234567890123456789012345678901234567890);
        bytes32 result = addr.sha3HexAddress();

        // Expected: keccak256("1234567890123456789012345678901234567890")
        bytes32 expected = keccak256(
            "1234567890123456789012345678901234567890"
        );
        assertEq(result, expected, "Should hash known address correctly");
    }

    function testSha3HexAddressMaxAddress() public pure {
        // Create max address from uint160
        address maxAddr = address(type(uint160).max);
        bytes32 result = maxAddr.sha3HexAddress();

        // Expected: keccak256("ffffffffffffffffffffffffffffffffffffffff")
        bytes32 expected = keccak256(
            "ffffffffffffffffffffffffffffffffffffffff"
        );
        assertEq(result, expected, "Should hash max address correctly");
    }

    function testSha3HexAddressLowercaseOutput() public pure {
        // Test that output matches lowercase hex regardless of internal representation
        address addr1 = address(0x1111111111111111111111111111111111111111);
        address addr2 = address(0x2222222222222222222222222222222222222222);
        // Use a valid 20-byte address with mixed case
        address addr3 = address(0xabCDEF1234567890ABcDEF1234567890aBCDeF12);

        bytes32 result1 = addr1.sha3HexAddress();
        bytes32 result2 = addr2.sha3HexAddress();
        bytes32 result3 = addr3.sha3HexAddress();

        // Expected values are lowercase
        bytes32 expected1 = keccak256(
            "1111111111111111111111111111111111111111"
        );
        bytes32 expected2 = keccak256(
            "2222222222222222222222222222222222222222"
        );
        bytes32 expected3 = keccak256(
            "abcdef1234567890abcdef1234567890abcdef12"
        );

        assertEq(result1, expected1, "Should hash address with 1s correctly");
        assertEq(result2, expected2, "Should hash address with 2s correctly");
        assertEq(result3, expected3, "Should convert mixed case to lowercase");
    }

    function testSha3HexAddressEquivalenceWithNaiveImplementation()
        public
        pure
    {
        // Test against a naive implementation to ensure correctness
        address testAddr1 = address(0x0000000000000000000000000000000000000001);
        address testAddr2 = address(0x1000000000000000000000000000000000000000);
        address testAddr3 = address(0x0000000000000000000000000000000000000010);

        bytes32 optimizedResult1 = testAddr1.sha3HexAddress();
        bytes32 naiveResult1 = _naiveSha3HexAddress(testAddr1);
        assertEq(
            optimizedResult1,
            naiveResult1,
            "Should match naive implementation for addr1"
        );

        bytes32 optimizedResult2 = testAddr2.sha3HexAddress();
        bytes32 naiveResult2 = _naiveSha3HexAddress(testAddr2);
        assertEq(
            optimizedResult2,
            naiveResult2,
            "Should match naive implementation for addr2"
        );

        bytes32 optimizedResult3 = testAddr3.sha3HexAddress();
        bytes32 naiveResult3 = _naiveSha3HexAddress(testAddr3);
        assertEq(
            optimizedResult3,
            naiveResult3,
            "Should match naive implementation for addr3"
        );
    }

    function testSha3HexAddressConsistency() public pure {
        // Test that calling the function multiple times with the same input gives the same result
        address testAddr = address(0x1234567890123456789012345678901234567890);

        bytes32 result1 = testAddr.sha3HexAddress();
        bytes32 result2 = testAddr.sha3HexAddress();
        bytes32 result3 = testAddr.sha3HexAddress();

        assertEq(result1, result2, "Should be consistent across calls");
        assertEq(result2, result3, "Should be consistent across calls");
        assertEq(result1, result3, "Should be consistent across calls");
    }

    function testSha3HexAddressDifferentInputsDifferentOutputs() public pure {
        // Test that different addresses produce different hashes (very high probability)
        address addr1 = address(0x1234567890123456789012345678901234567890);
        address addr2 = address(0x1234567890123456789012345678901234567891); // Different by 1

        bytes32 result1 = addr1.sha3HexAddress();
        bytes32 result2 = addr2.sha3HexAddress();

        assertTrue(
            result1 != result2,
            "Different addresses should produce different hashes"
        );
    }

    function testSha3HexAddressEdgeCases() public pure {
        // Test addresses with patterns that might expose edge cases in the assembly

        // Address with all same digits
        address sameDigits = address(
            0x1111111111111111111111111111111111111111
        );
        bytes32 result1 = sameDigits.sha3HexAddress();
        bytes32 expected1 = keccak256(
            "1111111111111111111111111111111111111111"
        );
        assertEq(result1, expected1, "Should handle same digit addresses");

        // Address alternating between 0 and F (will be lowercased to f)
        address alternating = address(
            0x0f0f0F0f0f0F0F0f0F0F0F0F0F0F0f0f0F0F0F0F
        );
        bytes32 result2 = alternating.sha3HexAddress();
        bytes32 expected2 = keccak256(
            "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f"
        );
        assertEq(
            result2,
            expected2,
            "Should handle alternating pattern addresses"
        );

        // Address with ascending pattern
        address ascending = address(0x0123456789012345678901234567890123456789);
        bytes32 result3 = ascending.sha3HexAddress();
        bytes32 expected3 = keccak256(
            "0123456789012345678901234567890123456789"
        );
        assertEq(
            result3,
            expected3,
            "Should handle ascending pattern addresses"
        );
    }

    function testSha3HexAddressFuzzedInputs() public pure {
        // Test with some pseudo-random inputs to ensure robustness
        uint160[5] memory values = [
            uint160(12345678901234567890),
            uint160(98765432109876543210),
            uint160(11111111111111111111),
            uint160(99999999999999999999),
            uint160(1)
        ];

        for (uint i = 0; i < values.length; i++) {
            address addr = address(values[i]);
            bytes32 result = addr.sha3HexAddress();

            // Convert address to lowercase hex string and verify hash
            string memory addrStr = _addressToLowercaseHex(addr);
            bytes32 expected = keccak256(bytes(addrStr));

            assertEq(
                result,
                expected,
                string(
                    abi.encodePacked(
                        "Should hash value ",
                        vm.toString(values[i]),
                        " correctly"
                    )
                )
            );
        }
    }

    function testSha3HexAddressGasOptimization() public view {
        // Verify the optimized implementation is actually more gas efficient
        address testAddr = address(0x1234567890123456789012345678901234567890);

        uint256 gasBefore = gasleft();
        testAddr.sha3HexAddress();
        uint256 gasUsedOptimized = gasBefore - gasleft();

        gasBefore = gasleft();
        _naiveSha3HexAddress(testAddr);
        uint256 gasUsedNaive = gasBefore - gasleft();

        // The optimized version should use less gas than the naive implementation
        // Note: This is a rough check; exact values may vary
        assertTrue(
            gasUsedOptimized < gasUsedNaive,
            "Optimized implementation should be more gas efficient"
        );
    }

    // Helper function: Naive implementation for comparison testing
    function _naiveSha3HexAddress(
        address addr
    ) internal pure returns (bytes32) {
        string memory hexStr = _addressToLowercaseHex(addr);
        return keccak256(bytes(hexStr));
    }

    // Helper function: Convert address to lowercase hex string (without 0x prefix)
    function _addressToLowercaseHex(
        address addr
    ) internal pure returns (string memory) {
        bytes memory buffer = new bytes(40);
        bytes memory alphabet = "0123456789abcdef";

        uint256 value = uint256(uint160(addr));
        for (uint256 i = 0; i < 20; i++) {
            buffer[39 - i * 2] = alphabet[value & 0xf];
            value >>= 4;
            buffer[38 - i * 2] = alphabet[value & 0xf];
            value >>= 4;
        }

        return string(buffer);
    }
}
