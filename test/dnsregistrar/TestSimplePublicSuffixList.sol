// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/SimplePublicSuffixList.sol";
import "./DynamicDNSFixtures.sol";

/**
 * @title TestSimplePublicSuffixList
 * @dev Tests for SimplePublicSuffixList contract functionality
 */
contract TestSimplePublicSuffixList is Test {
    SimplePublicSuffixList public suffixList;
    address public owner = address(0x1);
    address public nonOwner = address(0x2);

    function setUp() public {
        vm.prank(owner);
        suffixList = new SimplePublicSuffixList();
    }

    function testOwnerCanAddPublicSuffixes() public {
        bytes[] memory suffixes = new bytes[](2);
        suffixes[0] = DynamicDNSFixtures.dnsEncodeName("test");
        suffixes[1] = DynamicDNSFixtures.dnsEncodeName("co.nz");

        vm.expectEmit(true, false, false, true);
        emit SimplePublicSuffixList.SuffixAdded(suffixes[0]);
        vm.expectEmit(true, false, false, true);
        emit SimplePublicSuffixList.SuffixAdded(suffixes[1]);

        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(suffixes[0]),
            "test should be public suffix"
        );
        assertTrue(
            suffixList.isPublicSuffix(suffixes[1]),
            "co.nz should be public suffix"
        );
    }

    function testNonOwnerCannotAddPublicSuffixes() public {
        bytes[] memory suffixes = new bytes[](1);
        suffixes[0] = DynamicDNSFixtures.dnsEncodeName("test");

        vm.expectRevert(bytes(""));
        vm.prank(nonOwner);
        suffixList.addPublicSuffixes(suffixes);
    }

    function testIsPublicSuffixReturnsFalseForNonExistentSuffixes()
        public
        view
    {
        bytes memory nonExistentSuffix = DynamicDNSFixtures.dnsEncodeName(
            "example"
        );

        assertFalse(
            suffixList.isPublicSuffix(nonExistentSuffix),
            "Non-existent suffix should return false"
        );
    }

    function testCanAddEmptyArrayOfSuffixes() public {
        bytes[] memory emptySuffixes = new bytes[](0);

        vm.prank(owner);
        suffixList.addPublicSuffixes(emptySuffixes);

        // Should complete without reverting
    }

    function testCanAddSingleSuffix() public {
        bytes[] memory suffixes = new bytes[](1);
        suffixes[0] = DynamicDNSFixtures.dnsEncodeName("example");

        vm.expectEmit(true, false, false, true);
        emit SimplePublicSuffixList.SuffixAdded(suffixes[0]);

        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(suffixes[0]),
            "example should be public suffix"
        );
    }

    function testCanAddMultipleSuffixes() public {
        bytes[] memory suffixes = new bytes[](5);
        suffixes[0] = DynamicDNSFixtures.dnsEncodeName("com");
        suffixes[1] = DynamicDNSFixtures.dnsEncodeName("org");
        suffixes[2] = DynamicDNSFixtures.dnsEncodeName("net");
        suffixes[3] = DynamicDNSFixtures.dnsEncodeName("co.uk");
        suffixes[4] = DynamicDNSFixtures.dnsEncodeName("co.nz");

        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        for (uint256 i = 0; i < suffixes.length; i++) {
            assertTrue(
                suffixList.isPublicSuffix(suffixes[i]),
                "All added suffixes should be public suffixes"
            );
        }
    }

    function testCanAddSameSuffixMultipleTimes() public {
        bytes[] memory suffixes = new bytes[](1);
        suffixes[0] = DynamicDNSFixtures.dnsEncodeName("test");

        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(suffixes[0]),
            "Suffix should be public"
        );

        // Add same suffix again
        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(suffixes[0]),
            "Suffix should still be public"
        );
    }

    function testDifferentEncodingsOfSameName() public {
        // Test that different encodings of the same name are treated as different
        bytes memory testSuffix1 = DynamicDNSFixtures.dnsEncodeName("test");
        bytes memory testSuffix2 = hex"0474657374ff"; // Manually crafted different encoding

        bytes[] memory suffixes = new bytes[](1);
        suffixes[0] = testSuffix1;

        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(testSuffix1),
            "Properly encoded test should be public suffix"
        );
        assertFalse(
            suffixList.isPublicSuffix(testSuffix2),
            "Differently encoded test should not be public suffix"
        );
    }

    function testOwnershipTransfer() public {
        // Test that ownership can be transferred and new owner can add suffixes
        vm.prank(owner);
        suffixList.transferOwnership(nonOwner);

        bytes[] memory suffixes = new bytes[](1);
        suffixes[0] = DynamicDNSFixtures.dnsEncodeName("newowner");

        vm.prank(nonOwner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(suffixes[0]),
            "New owner should be able to add suffixes"
        );

        // Original owner should no longer be able to add suffixes
        bytes[] memory moreSuffixes = new bytes[](1);
        moreSuffixes[0] = DynamicDNSFixtures.dnsEncodeName("denied");

        vm.expectRevert(bytes(""));
        vm.prank(owner);
        suffixList.addPublicSuffixes(moreSuffixes);
    }

    function testEmptyNameSuffix() public {
        bytes[] memory suffixes = new bytes[](1);
        suffixes[0] = hex"00"; // Empty DNS name (just root)

        vm.prank(owner);
        suffixList.addPublicSuffixes(suffixes);

        assertTrue(
            suffixList.isPublicSuffix(suffixes[0]),
            "Empty name should be addable as suffix"
        );
    }
}
