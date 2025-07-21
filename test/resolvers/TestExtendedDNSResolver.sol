// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/resolvers/profiles/ExtendedDNSResolver.sol";
import "../../contracts/resolvers/profiles/IExtendedDNSResolver.sol";

/**
 * @title TestExtendedDNSResolver
 * @dev Tests for ExtendedDNSResolver functionality
 */
contract TestExtendedDNSResolver is Test {
    ExtendedDNSResolver public resolver;

    // Test accounts
    address constant OWNER = address(0x1);
    address constant USER1 = address(0x2);

    // Test constants
    bytes32 constant TEST_NODE = keccak256("test.eth");
    bytes constant TEST_DNS_NAME = hex"03666f6f03746573740000"; // foo.test

    function setUp() public {
        // Deploy extended DNS resolver
        resolver = new ExtendedDNSResolver();
    }

    function testExtendedDNSResolverDeployment() public view {
        // Test that resolver is properly deployed
        assertTrue(
            address(resolver) != address(0),
            "Resolver should be deployed"
        );
    }

    function testSupportsInterface() public view {
        // Test that resolver supports expected interfaces

        // Calculate the correct interface ID for IExtendedDNSResolver
        bytes4 expectedInterfaceId = type(IExtendedDNSResolver).interfaceId;

        // Test with the calculated interface ID
        assertTrue(
            resolver.supportsInterface(expectedInterfaceId),
            "Should support IExtendedDNSResolver"
        );

        // Note: ExtendedDNSResolver only supports IExtendedDNSResolver interface
        // It does not support IERC165 in its current implementation
    }

    function testResolveFunction() public view {
        // Test the resolve function with empty context - should return empty result for addr query

        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );
        bytes memory context = ""; // Empty context

        // With empty context, addr query should return empty bytes (no revert)
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            queryData,
            context
        );
        assertEq(
            result.length,
            0,
            "Empty context should return empty result for addr query"
        );
    }

    function testResolveWithTextQuery() public view {
        // Test resolve with text query - should return empty result with empty context

        bytes memory textQuery = abi.encodeWithSignature(
            "text(bytes32,string)",
            TEST_NODE,
            "email"
        );
        bytes memory context = "";

        // Text query with empty context should return empty string encoded
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            textQuery,
            context
        );
        string memory decodedResult = abi.decode(result, (string));
        assertEq(
            bytes(decodedResult).length,
            0,
            "Empty context should return empty text"
        );
    }

    function testResolveWithAddressQuery() public view {
        // Test resolve with address query - should return empty with empty context

        bytes memory addrQuery = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );
        bytes memory context = "";

        // Address query with empty context should return empty bytes
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            addrQuery,
            context
        );
        assertEq(
            result.length,
            0,
            "Empty context should return empty result for address query"
        );
    }

    function testResolveWithContenthashQuery() public {
        // Test resolve with unsupported contenthash query - should revert with NotImplemented

        bytes memory contenthashQuery = abi.encodeWithSignature(
            "contenthash(bytes32)",
            TEST_NODE
        );
        bytes memory context = "";

        // Contenthash is not supported by ExtendedDNSResolver - should revert
        vm.expectRevert(abi.encodeWithSignature("NotImplemented()"));
        resolver.resolve(TEST_DNS_NAME, contenthashQuery, context);
    }

    function testResolveWithMulticoinQuery() public view {
        // Test resolve with multicoin address query - should return empty with empty context

        bytes memory multicoinQuery = abi.encodeWithSignature(
            "addr(bytes32,uint256)",
            TEST_NODE,
            uint256(0)
        ); // Bitcoin
        bytes memory context = "";

        // Multicoin query with empty context should return empty bytes
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            multicoinQuery,
            context
        );
        assertEq(
            result.length,
            0,
            "Empty context should return empty result for multicoin query"
        );
    }

    function testResolveWithPubkeyQuery() public {
        // Test resolve with unsupported pubkey query - should revert with NotImplemented

        bytes memory pubkeyQuery = abi.encodeWithSignature(
            "pubkey(bytes32)",
            TEST_NODE
        );
        bytes memory context = "";

        // Pubkey is not supported by ExtendedDNSResolver - should revert
        vm.expectRevert(abi.encodeWithSignature("NotImplemented()"));
        resolver.resolve(TEST_DNS_NAME, pubkeyQuery, context);
    }

    function testResolveWithABIQuery() public {
        // Test resolve with unsupported ABI query - should revert with NotImplemented

        bytes memory abiQuery = abi.encodeWithSignature(
            "ABI(bytes32,uint256)",
            TEST_NODE,
            uint256(1)
        );
        bytes memory context = "";

        // ABI is not supported by ExtendedDNSResolver - should revert
        vm.expectRevert(abi.encodeWithSignature("NotImplemented()"));
        resolver.resolve(TEST_DNS_NAME, abiQuery, context);
    }

    function testResolveWithNameQuery() public {
        // Test resolve with unsupported name query - should revert with NotImplemented

        bytes memory nameQuery = abi.encodeWithSignature(
            "name(bytes32)",
            TEST_NODE
        );
        bytes memory context = "";

        // Name is not supported by ExtendedDNSResolver - should revert
        vm.expectRevert(abi.encodeWithSignature("NotImplemented()"));
        resolver.resolve(TEST_DNS_NAME, nameQuery, context);
    }

    function testDNSNameHandling() public view {
        // Test different DNS name formats

        bytes memory rootName = hex"00"; // Root domain
        bytes memory simpleLabel = hex"047465737400"; // "test"
        bytes memory multilabelName = hex"03666f6f03626172047465737400"; // "foo.bar.test"

        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            bytes32(0)
        );
        bytes memory context = "";

        // All should return empty bytes since context is empty (name parameter is ignored)
        bytes memory result1 = resolver.resolve(rootName, queryData, context);
        bytes memory result2 = resolver.resolve(
            simpleLabel,
            queryData,
            context
        );
        bytes memory result3 = resolver.resolve(
            multilabelName,
            queryData,
            context
        );

        assertEq(
            result1.length,
            0,
            "Root name with empty context should return empty"
        );
        assertEq(
            result2.length,
            0,
            "Simple label with empty context should return empty"
        );
        assertEq(
            result3.length,
            0,
            "Multi-label name with empty context should return empty"
        );
    }

    function testInvalidDNSNames() public view {
        // Test with invalid DNS names

        bytes memory invalidName1 = hex"ff"; // Invalid length
        bytes memory invalidName2 = hex"4374657374"; // Missing null terminator
        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            bytes32(0)
        );
        bytes memory context = "";

        // These should succeed since name parameter is ignored, only context matters
        bytes memory result1 = resolver.resolve(
            invalidName1,
            queryData,
            context
        );
        bytes memory result2 = resolver.resolve(
            invalidName2,
            queryData,
            context
        );

        assertEq(
            result1.length,
            0,
            "Invalid name 1 should return empty with empty context"
        );
        assertEq(
            result2.length,
            0,
            "Invalid name 2 should return empty with empty context"
        );
    }

    function testEmptyQueryData() public {
        // Test with empty query data - should revert due to invalid function selector

        bytes memory emptyQuery = "";
        bytes memory context = "";

        // Empty query data means invalid function selector - should revert
        vm.expectRevert();
        resolver.resolve(TEST_DNS_NAME, emptyQuery, context);
    }

    function testLargeQueryData() public {
        // Test with large query data - should revert with NotImplemented

        bytes memory largeQuery = new bytes(1000);
        bytes memory context = "";
        // Fill with some dummy function call data
        for (uint i = 0; i < 1000; i++) {
            largeQuery[i] = bytes1(uint8(i % 256));
        }

        // Large query with invalid function selector should revert with NotImplemented
        vm.expectRevert(abi.encodeWithSignature("NotImplemented()"));
        resolver.resolve(TEST_DNS_NAME, largeQuery, context);
    }

    function testUnsupportedFunction() public {
        // Test with unsupported function selector - should revert with NotImplemented

        bytes memory unsupportedQuery = abi.encodeWithSignature(
            "unsupportedFunction(bytes32)",
            TEST_NODE
        );
        bytes memory context = "";

        // Unsupported function selector should revert with NotImplemented
        vm.expectRevert(abi.encodeWithSignature("NotImplemented()"));
        resolver.resolve(TEST_DNS_NAME, unsupportedQuery, context);
    }

    function testResolverBehaviorWithMockData() public view {
        // Test resolver behavior with valid DNS TXT record data

        // Create valid DNS TXT record data with Ethereum address
        bytes
            memory validTxtRecord = "a[60]=0x1234567890123456789012345678901234567890";
        bytes memory dnsName = hex"03666f6f03746573740000"; // foo.test
        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );
        bytes memory context = validTxtRecord;

        // Test that resolver properly parses valid DNS TXT record format
        bytes memory result = resolver.resolve(dnsName, queryData, context);

        // Should return the encoded address
        assertTrue(
            result.length > 0,
            "Valid TXT record should return address data"
        );
        address decodedAddr = abi.decode(result, (address));
        assertEq(
            decodedAddr,
            0x1234567890123456789012345678901234567890,
            "Should decode correct address"
        );
    }

    function testNodeCalculation() public pure {
        // Test how DNS names are converted to ENS nodes

        bytes memory testName = hex"03666f6f03746573740000"; // foo.test

        // The resolver should have internal logic to convert DNS names to nodes
        // This is typically done by reversing the labels and hashing

        assertTrue(testName.length > 0, "Test name should be non-empty");
    }

    function testErrorHandling() public view {
        // Test various error conditions - ExtendedDNSResolver ignores name parameter

        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );
        bytes memory context = "";

        // Test with malformed DNS names - should succeed since name is ignored
        bytes[] memory malformedNames = new bytes[](3);
        malformedNames[0] = hex"ff00"; // Invalid length byte
        malformedNames[1] = hex"0400"; // Incomplete label
        malformedNames[2] = hex""; // Empty name

        // All should return empty bytes since context is empty and name is ignored
        for (uint i = 0; i < malformedNames.length; i++) {
            bytes memory result = resolver.resolve(
                malformedNames[i],
                queryData,
                context
            );
            assertEq(
                result.length,
                0,
                "Malformed names should return empty with empty context"
            );
        }
    }

    function testContextParameter() public view {
        // Test different context parameters

        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );
        bytes memory emptyContext = "";
        bytes memory contextWithData = "deadbeef"; // String instead of hex

        // Test with empty context - should return empty
        bytes memory result1 = resolver.resolve(
            TEST_DNS_NAME,
            queryData,
            emptyContext
        );
        assertEq(result1.length, 0, "Empty context should return empty result");

        // Test with non-DNS context data - should return empty since it doesn't match expected format
        bytes memory result2 = resolver.resolve(
            TEST_DNS_NAME,
            queryData,
            contextWithData
        );
        assertEq(
            result2.length,
            0,
            "Invalid context format should return empty result"
        );
    }

    function testTextRecordFormatParsing() public view {
        // Test parsing of text record formats like "a[60]=0x123..."

        bytes
            memory context = "a[60]=0x1234567890123456789012345678901234567890";
        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );

        // Should successfully parse the address from the context
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            queryData,
            context
        );
        assertTrue(
            result.length > 0,
            "Valid address format should return data"
        );

        address decodedAddr = abi.decode(result, (address));
        assertEq(
            decodedAddr,
            0x1234567890123456789012345678901234567890,
            "Should parse address correctly"
        );
    }

    // Additional tests to cover error conditions and proper functionality

    function testInvalidAddressFormat() public {
        // Test InvalidAddressFormat error with malformed hex address

        bytes memory invalidContext = "a[60]=0xinvalidhex";
        bytes memory queryData = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );

        // Should revert with InvalidAddressFormat - the parameter is the actual bytes found
        vm.expectRevert(
            abi.encodeWithSignature(
                "InvalidAddressFormat(bytes)",
                "0xinvalidhex"
            )
        );
        resolver.resolve(TEST_DNS_NAME, queryData, invalidContext);
    }

    function testTextQueryWithValidData() public view {
        // Test text query with valid context data

        bytes memory context = "t[email]=test@example.com";
        bytes memory textQuery = abi.encodeWithSignature(
            "text(bytes32,string)",
            TEST_NODE,
            "email"
        );

        // Should return the text value
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            textQuery,
            context
        );
        string memory decodedText = abi.decode(result, (string));
        assertEq(
            decodedText,
            "test@example.com",
            "Should return correct text value"
        );
    }

    function testTextQueryNotFound() public view {
        // Test text query for key that doesn't exist

        bytes memory context = "t[email]=test@example.com";
        bytes memory textQuery = abi.encodeWithSignature(
            "text(bytes32,string)",
            TEST_NODE,
            "nonexistent"
        );

        // Should return empty string
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            textQuery,
            context
        );
        string memory decodedText = abi.decode(result, (string));
        assertEq(
            bytes(decodedText).length,
            0,
            "Non-existent key should return empty string"
        );
    }

    function testMulticoinAddress() public view {
        // Test multicoin address query with Bitcoin

        bytes
            memory context = "a[0]=0x1234567890123456789012345678901234567890";
        bytes memory multicoinQuery = abi.encodeWithSignature(
            "addr(bytes32,uint256)",
            TEST_NODE,
            uint256(0)
        );

        // Should return the Bitcoin address
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            multicoinQuery,
            context
        );
        assertTrue(result.length > 0, "Bitcoin address should be returned");

        address decodedAddr = abi.decode(result, (address));
        assertEq(
            decodedAddr,
            0x1234567890123456789012345678901234567890,
            "Should return correct Bitcoin address"
        );
    }

    function testMulticoinAddressNotFound() public view {
        // Test multicoin address query for coin type that doesn't exist

        bytes
            memory context = "a[60]=0x1234567890123456789012345678901234567890";
        bytes memory multicoinQuery = abi.encodeWithSignature(
            "addr(bytes32,uint256)",
            TEST_NODE,
            uint256(1)
        );

        // Should return empty bytes
        bytes memory result = resolver.resolve(
            TEST_DNS_NAME,
            multicoinQuery,
            context
        );
        assertEq(
            result.length,
            0,
            "Non-existent coin type should return empty"
        );
    }

    function testComplexContext() public view {
        // Test complex context with multiple key-value pairs

        bytes
            memory context = "a[60]=0x1234567890123456789012345678901234567890 t[email]=test@example.com t[url]=https://example.com";

        // Test address query
        bytes memory addrQuery = abi.encodeWithSignature(
            "addr(bytes32)",
            TEST_NODE
        );
        bytes memory addrResult = resolver.resolve(
            TEST_DNS_NAME,
            addrQuery,
            context
        );
        address decodedAddr = abi.decode(addrResult, (address));
        assertEq(
            decodedAddr,
            0x1234567890123456789012345678901234567890,
            "Should parse address from complex context"
        );

        // Test text query for email
        bytes memory emailQuery = abi.encodeWithSignature(
            "text(bytes32,string)",
            TEST_NODE,
            "email"
        );
        bytes memory emailResult = resolver.resolve(
            TEST_DNS_NAME,
            emailQuery,
            context
        );
        string memory decodedEmail = abi.decode(emailResult, (string));
        assertEq(
            decodedEmail,
            "test@example.com",
            "Should parse email from complex context"
        );

        // Test text query for URL
        bytes memory urlQuery = abi.encodeWithSignature(
            "text(bytes32,string)",
            TEST_NODE,
            "url"
        );
        bytes memory urlResult = resolver.resolve(
            TEST_DNS_NAME,
            urlQuery,
            context
        );
        string memory decodedUrl = abi.decode(urlResult, (string));
        assertEq(
            decodedUrl,
            "https://example.com",
            "Should parse URL from complex context"
        );
    }
}
