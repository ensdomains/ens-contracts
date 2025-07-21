// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/TLDPublicSuffixList.sol";
import "../../contracts/utils/NameCoder.sol";

/**
 * @title TestTLDPublicSuffixList
 * @dev Tests TLD public suffix list functionality - verifying that single-label domains (TLDs) are treated as public suffixes while multi-label domains are not
 */
contract TestTLDPublicSuffixList is Test {
    TLDPublicSuffixList public tldPublicSuffixList;

    function setUp() public {
        tldPublicSuffixList = new TLDPublicSuffixList();
    }

    /**
     * Treats all TLDs as public suffixes
     * Tests that single-label domains (TLDs) are recognized as public suffixes
     */
    function testTreatsAllTLDsAsPublicSuffixes() public view {
        assertTrue(
            tldPublicSuffixList.isPublicSuffix(dnsEncodeName("eth")),
            "eth should be treated as public suffix"
        );
        assertTrue(
            tldPublicSuffixList.isPublicSuffix(dnsEncodeName("com")),
            "com should be treated as public suffix"
        );
    }

    /**
     * Treats all non-TLDs as non-public suffixes
     * Tests that empty names and multi-label domains are NOT public suffixes
     */
    function testTreatsAllNonTLDsAsNonPublicSuffixes() public view {
        assertFalse(
            tldPublicSuffixList.isPublicSuffix(dnsEncodeName("")),
            "empty string should not be treated as public suffix"
        );
        assertFalse(
            tldPublicSuffixList.isPublicSuffix(dnsEncodeName("foo.eth")),
            "foo.eth should not be treated as public suffix"
        );
        assertFalse(
            tldPublicSuffixList.isPublicSuffix(dnsEncodeName("a.b.foo.eth")),
            "a.b.foo.eth should not be treated as public suffix"
        );
    }

    /**
     * @dev Convert human-readable domain name to DNS packet format using NameCoder library
     * @param name Domain name (e.g., "foo.eth")
     * @return DNS encoded bytes
     */
    function dnsEncodeName(
        string memory name
    ) internal pure returns (bytes memory) {
        return NameCoder.encode(name);
    }
}
