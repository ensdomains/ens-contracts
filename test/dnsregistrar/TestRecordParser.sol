// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/mocks/DummyParser.sol";

/**
 * @title TestRecordParser
 * @dev Tests DNS record parsing functionality for structured data with key-value pairs and URLs
 */
contract TestRecordParser is Test {
    DummyParser public parser;

    function setUp() public {
        parser = new DummyParser();
    }

    /**
     * parses data
     * Tests basic parsing of format: 'usdt;issuer=tether decimals=18;https://tether.to'
     */
    function testParsesData() public view {
        string memory data = "usdt;issuer=tether decimals=18;https://tether.to";
        (
            string memory name,
            string[] memory keys,
            string[] memory values,
            string memory url
        ) = parser.parseData(bytes(data), 2);

        // correct name
        assertEq(name, "usdt");
        // correct keys and values
        assertEq(keys[0], "issuer");
        assertEq(values[0], "tether");
        assertEq(keys[1], "decimals");
        assertTrue(
            keccak256(bytes(values[1])) !=
                keccak256(bytes("18;https://tether.to")),
            "Should not include URL in value"
        );
        assertEq(url, "https://tether.to");
    }

    /**
     * parses data with single key-value pair
     * Tests single key-value parsing
     */
    function testParsesDataWithSingleKeyValuePair() public view {
        string memory data = "token;name=bitcoin;https://bitcoin.org";
        (
            string memory name,
            string[] memory keys,
            string[] memory values,
            string memory url
        ) = parser.parseData(bytes(data), 1);

        assertEq(name, "token");
        assertEq(keys.length, 1);
        assertEq(keys[0], "name");
        assertEq(values[0], "bitcoin");
        assertEq(url, "https://bitcoin.org");
    }

    /**
     * parses data with no key-value pairs
     * Tests parsing when kvCount is 0 - should return empty arrays
     */
    function testParsesDataWithNoKeyValuePairs() public view {
        string memory data = "simple;;https://example.com";
        (
            string memory name,
            string[] memory keys,
            string[] memory values,
            string memory url
        ) = parser.parseData(bytes(data), 0);

        assertEq(name, "simple");
        assertEq(keys.length, 0);
        assertEq(values.length, 0);
        assertEq(url, "https://example.com");
    }

    /**
     * handles spaces in values correctly
     * Tests space-terminated parsing behavior (matches Solidity behavior)
     */
    function testHandlesSpacesInValuesCorrectly() public view {
        string memory data = "test;desc=hello world;https://test.com";
        (
            string memory name,
            string[] memory keys,
            string[] memory values,
            string memory url
        ) = parser.parseData(bytes(data), 1);

        assertEq(name, "test");
        assertEq(keys[0], "desc");
        // Note: Space-terminated parsing matches Solidity behavior
        assertEq(values[0], "hello");
        assertEq(url, "https://test.com");
    }

    /**
     * handles malformed data gracefully
     * Tests error handling for data missing required semicolons
     */
    function testHandlesMalformedDataGracefully() public {
        // Test with missing semicolons
        string memory malformedData = "malformed-data";

        vm.expectRevert(bytes(""));
        parser.parseData(bytes(malformedData), 1);
    }

    /**
     * handles empty input data
     * Tests error handling for completely empty input
     */
    function testHandlesEmptyInputData() public {
        vm.expectRevert(bytes(""));
        parser.parseData(bytes(""), 0);
    }

    /**
     * handles key-value pairs without equals sign
     * Tests error handling for malformed key-value pairs
     */
    function testHandlesKeyValuePairsWithoutEqualsSign() public view {
        // This should handle malformed key-value pairs gracefully
        string memory data = "test;noequals;https://test.com";

        // The Solidity implementation handles this gracefully by returning empty strings
        (
            string memory name,
            string[] memory keys,
            string[] memory values,
            string memory url
        ) = parser.parseData(bytes(data), 1);

        assertEq(name, "test");
        assertEq(keys[0], ""); // Empty key for malformed input
        assertEq(values[0], ""); // Empty value for malformed input
        assertEq(url, "https://test.com");
    }

    /**
     * handles multiple different formats
     * Tests various record formats to ensure robust parsing
     */
    function testHandlesMultipleDifferentFormats() public view {
        // Test various record formats
        string[3] memory formats = [
            "crypto;symbol=BTC price=50000;https://bitcoin.org",
            "token;supply=21000000 decimals=8;https://bitcoin.org",
            "nft;collection=punks rarity=legendary;https://larvalabs.com"
        ];

        for (uint i = 0; i < formats.length; i++) {
            (
                string memory name,
                string[] memory keys,
                string[] memory values,
                string memory url
            ) = parser.parseData(bytes(formats[i]), 2);

            assertTrue(bytes(name).length > 0, "Name should not be empty");
            assertEq(keys.length, 2);
            assertEq(values.length, 2);
            assertTrue(bytes(url).length > 0, "URL should not be empty");
        }
    }

    /**
     * validates internal key-value parsing behavior
     * Tests edge cases that exercise readKeyValue function internally
     */
    function testValidatesInternalKeyValueParsingBehavior() public view {
        // Test edge cases that exercise readKeyValue function internally

        // Test case 1: Simple key=value
        string memory data1 = "test;key=value;url";
        (
            string memory name1,
            string[] memory keys1,
            string[] memory values1,
            string memory url1
        ) = parser.parseData(bytes(data1), 1);
        assertEq(keys1[0], "key");
        assertEq(values1[0], "value");

        // Test case 2: Long key and value
        string memory data2 = "test;long_key=complex_value_123;url";
        (
            string memory name2,
            string[] memory keys2,
            string[] memory values2,
            string memory url2
        ) = parser.parseData(bytes(data2), 1);
        assertEq(keys2[0], "long_key");
        assertEq(values2[0], "complex_value_123");

        // Test case 3: Multiple space-separated key-value pairs
        string memory data3 = "test;a=1 b=2 c=3;url";
        (
            string memory name3,
            string[] memory keys3,
            string[] memory values3,
            string memory url3
        ) = parser.parseData(bytes(data3), 3);
        assertEq(keys3[0], "a");
        assertEq(values3[0], "1");
        assertEq(keys3[1], "b");
        assertEq(values3[1], "2");
        assertEq(keys3[2], "c");
        assertEq(values3[2], "3");
    }

    /**
     * handles boundary conditions in parsing
     * Tests boundary conditions that stress the parsing logic
     */
    function testHandlesBoundaryConditionsInParsing() public view {
        // Test boundary conditions that stress the parsing logic

        // Minimum valid format
        string memory data1 = "n;k=v;u";
        (
            string memory name1,
            string[] memory keys1,
            string[] memory values1,
            string memory url1
        ) = parser.parseData(bytes(data1), 1);
        assertTrue(bytes(name1).length > 0, "Name should not be empty");
        assertEq(keys1.length, 1);
        assertEq(values1.length, 1);
        assertTrue(bytes(url1).length > 0, "URL should not be empty");

        // Maximum reasonable length
        string
            memory data2 = "very_long_name_that_tests_boundaries;very_long_key_name=very_long_value_content_that_should_be_parsed_correctly;https://very-long-url-that-should-be-handled-properly.example.com";
        (
            string memory name2,
            string[] memory keys2,
            string[] memory values2,
            string memory url2
        ) = parser.parseData(bytes(data2), 1);
        assertTrue(bytes(name2).length > 0, "Name should not be empty");
        assertEq(keys2.length, 1);
        assertEq(values2.length, 1);
        assertTrue(bytes(url2).length > 0, "URL should not be empty");

        // Empty values
        string memory data3 = "test;key=;url";
        (
            string memory name3,
            string[] memory keys3,
            string[] memory values3,
            string memory url3
        ) = parser.parseData(bytes(data3), 1);
        assertTrue(bytes(name3).length > 0, "Name should not be empty");
        assertEq(keys3.length, 1);
        assertEq(values3.length, 1);
        assertTrue(bytes(url3).length > 0, "URL should not be empty");
    }

    /**
     * validates parsing offset and length calculations
     * Tests cases that validate internal offset calculations
     */
    function testValidatesParsingOffsetAndLengthCalculations() public view {
        // Test cases that validate internal offset calculations

        // Test with multiple key-value pairs with different lengths
        string memory data1 = "test;first=1 second=2 third=3;url";
        (
            string memory name1,
            string[] memory keys1,
            string[] memory values1,
            string memory url1
        ) = parser.parseData(bytes(data1), 3);
        assertEq(keys1[0], "first");
        assertEq(values1[0], "1");
        assertEq(keys1[1], "second");
        assertEq(values1[1], "2");
        assertEq(keys1[2], "third");
        assertEq(values1[2], "3");

        // Test with varying key-value lengths
        string
            memory data2 = "complex;short=x very_long_key=very_long_value medium=mid;https://example.com";
        (
            string memory name2,
            string[] memory keys2,
            string[] memory values2,
            string memory url2
        ) = parser.parseData(bytes(data2), 3);
        assertEq(keys2[0], "short");
        assertEq(values2[0], "x");
        assertEq(keys2[1], "very_long_key");
        assertEq(values2[1], "very_long_value");
        assertEq(keys2[2], "medium");
        assertEq(values2[2], "mid");

        // Verify all basic structure is maintained
        assertTrue(bytes(name2).length > 0, "Name should not be empty");
        assertTrue(bytes(url2).length > 0, "URL should not be empty");
    }
}
