// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import {TestStringUtils} from "../../contracts/utils/TestStringUtils.sol";

/**
 * @title TestTestStringUtils
 * @dev Tests string utility functions for strlen (UTF-8 character counting) and escape (JSON-standard escaping)
 */
contract TestTestStringUtils is Test {
    function setUp() public {
        // No setup needed for StringUtils tests
    }

    // ==================== ESCAPE FUNCTION TESTS ====================

    /**
     * Test 1: 'should escape double quote correctly based on JSON standard'
     * Tests double quote escaping according to JSON standard
     */
    function testShouldEscapeDoubleQuoteCorrectlyBasedOnJSONStandard()
        public
        pure
    {
        string memory input = 'My ENS is, "tanrikulu.eth"';
        string memory expected = 'My ENS is, \\"tanrikulu.eth\\"';
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "Double quote escaping should match JSON standard"
        );
    }

    /**
     * Test 2: 'should escape backslash correctly based on JSON standard'
     * Tests backslash escaping according to JSON standard
     */
    function testShouldEscapeBackslashCorrectlyBasedOnJSONStandard()
        public
        pure
    {
        string memory input = "Path\\to\\file";
        string memory expected = "Path\\\\to\\\\file";
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "Backslash escaping should match JSON standard"
        );
    }

    /**
     * Test 3: 'should escape new line character correctly based on JSON standard'
     * Tests newline character escaping according to JSON standard
     */
    function testShouldEscapeNewLineCharacterCorrectlyBasedOnJSONStandard()
        public
        pure
    {
        string memory input = "Line 1\nLine 2";
        string memory expected = "Line 1\\nLine 2";
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "Newline escaping should match JSON standard"
        );
    }

    /**
     * Test escape with carriage return
     */
    function testEscapeCarriageReturn() public pure {
        string memory input = "Line 1\rLine 2";
        string memory expected = "Line 1\\rLine 2";
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "Carriage return escaping should work correctly"
        );
    }

    /**
     * Test escape with tab character
     */
    function testEscapeTab() public pure {
        string memory input = "Column1\tColumn2";
        string memory expected = "Column1\\tColumn2";
        string memory result = TestStringUtils.escape(input);

        assertEq(result, expected, "Tab escaping should work correctly");
    }

    /**
     * Test escape with forward slash
     */
    function testEscapeForwardSlash() public pure {
        string memory input = "https://ens.domains/";
        string memory expected = "https:\\/\\/ens.domains\\/";
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "Forward slash escaping should work correctly"
        );
    }

    /**
     * Test escape with multiple special characters
     */
    function testEscapeMultipleSpecialCharacters() public pure {
        string memory input = 'Quote: "Hello"\nPath: C:\\\\temp\tDone';
        string
            memory expected = 'Quote: \\"Hello\\"\\nPath: C:\\\\\\\\temp\\tDone';
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "Multiple special characters should be escaped correctly"
        );
    }

    /**
     * Test escape with empty string
     */
    function testEscapeEmptyString() public pure {
        string memory input = "";
        string memory expected = "";
        string memory result = TestStringUtils.escape(input);

        assertEq(result, expected, "Empty string should remain empty");
    }

    /**
     * Test escape with no special characters
     */
    function testEscapeNoSpecialCharacters() public pure {
        string
            memory input = "This is a normal string without special characters";
        string
            memory expected = "This is a normal string without special characters";
        string memory result = TestStringUtils.escape(input);

        assertEq(
            result,
            expected,
            "String with no special characters should remain unchanged"
        );
    }

    // ==================== STRLEN FUNCTION TESTS ====================

    /**
     * Test strlen with empty string
     */
    function testStrlenEmptyString() public pure {
        string memory input = "";
        uint256 result = TestStringUtils.strlen(input);

        assertEq(result, 0, "Empty string should have length 0");
    }

    /**
     * Test strlen with ASCII characters only
     */
    function testStrlenASCIIOnly() public pure {
        string memory input = "Hello World";
        uint256 result = TestStringUtils.strlen(input);

        assertEq(result, 11, "ASCII string should count characters correctly");
    }

    /**
     * Test strlen with single ASCII character
     */
    function testStrlenSingleASCII() public pure {
        string memory input = "A";
        uint256 result = TestStringUtils.strlen(input);

        assertEq(result, 1, "Single ASCII character should have length 1");
    }

    /**
     * Test strlen with UTF-8 boundary cases using hex encoding
     */
    function testStrlenUTF8ByteBoundaries() public pure {
        // Test 2-byte UTF-8 character (Latin supplement)
        // Using hex encoding to avoid compilation issues with UTF-8 literals
        string memory twoByte = "\xC3\xA9"; // 'é' in UTF-8
        uint256 result1 = TestStringUtils.strlen(twoByte);
        assertEq(
            result1,
            1,
            "2-byte UTF-8 character should count as 1 character"
        );

        // Test string with mix of ASCII and 2-byte characters
        string memory mixed = "caf\xC3\xA9"; // "café"
        uint256 result2 = TestStringUtils.strlen(mixed);
        assertEq(
            result2,
            4,
            "Mixed ASCII and 2-byte UTF-8 should count correctly"
        );
    }

    /**
     * Test strlen with 3-byte UTF-8 characters using hex encoding
     */
    function testStrlenThreeByteUTF8Hex() public pure {
        // Euro symbol (€) is 3 bytes: 0xE2 0x82 0xAC
        string memory euroSymbol = "\xE2\x82\xAC";
        uint256 result = TestStringUtils.strlen(euroSymbol);

        assertEq(
            result,
            1,
            "3-byte UTF-8 character should count as 1 character"
        );
    }

    /**
     * Test strlen with ASCII + extended characters
     */
    function testStrlenMixedASCIIAndExtended() public pure {
        // Mix ASCII with extended characters
        string memory input = "Price: \xE2\x82\xAC 100"; // "Price: € 100"
        uint256 result = TestStringUtils.strlen(input);

        // "Price: " (7) + "€" (1) + " 100" (4) = 12 characters
        assertEq(
            result,
            12,
            "Mixed ASCII and extended characters should count correctly"
        );
    }

    /**
     * Test strlen with ENS domain examples
     */
    function testStrlenENSDomains() public pure {
        // ASCII domain
        string memory domain1 = "vitalik.eth";
        assertEq(
            TestStringUtils.strlen(domain1),
            11,
            "ASCII ENS domain should be counted correctly"
        );

        // Domain with numbers
        string memory domain2 = "test123.eth";
        assertEq(
            TestStringUtils.strlen(domain2),
            11,
            "ENS domain with numbers should be counted correctly"
        );

        // Domain with special characters
        string memory domain3 = "test-name.eth";
        assertEq(
            TestStringUtils.strlen(domain3),
            13,
            "ENS domain with hyphen should be counted correctly"
        );
    }

    /**
     * Test strlen with various UTF-8 boundary cases
     */
    function testStrlenUTF8BoundaryCases() public pure {
        // Test characters at UTF-8 encoding boundaries

        // 1-byte boundary (0x7F = 127)
        string memory oneByte = "\x7F";
        assertEq(
            TestStringUtils.strlen(oneByte),
            1,
            "1-byte UTF-8 boundary character should work"
        );

        // 2-byte start (using hex encoding)
        string memory twoByte = "\xC3\xBF"; // ÿ character
        assertEq(
            TestStringUtils.strlen(twoByte),
            1,
            "2-byte UTF-8 character should work"
        );

        // 3-byte character (Euro symbol using hex encoding)
        string memory threeByte = "\xE2\x82\xAC"; // Euro symbol
        assertEq(
            TestStringUtils.strlen(threeByte),
            1,
            "3-byte UTF-8 character should work"
        );
    }

    /**
     * Test strlen with long strings
     */
    function testStrlenLongStrings() public pure {
        // Test with a longer ASCII string
        string
            memory longASCII = "This is a longer string to test the strlen function with more characters";
        uint256 result1 = TestStringUtils.strlen(longASCII);
        assertEq(result1, 72, "Long ASCII string should be counted correctly");

        // Test with repeated extended characters using hex encoding
        string memory repeatExtended = "\xE2\x82\xAC\xE2\x82\xAC\xE2\x82\xAC"; // Three Euro symbols
        uint256 result2 = TestStringUtils.strlen(repeatExtended);
        assertEq(
            result2,
            3,
            "Repeated extended characters should be counted correctly"
        );
    }

    /**
     * Test strlen with whitespace characters
     */
    function testStrlenWhitespace() public pure {
        string memory spaces = "   ";
        assertEq(TestStringUtils.strlen(spaces), 3, "Spaces should be counted");

        string memory tabs = "\t\t";
        assertEq(TestStringUtils.strlen(tabs), 2, "Tabs should be counted");

        string memory newlines = "\n\n\n";
        assertEq(
            TestStringUtils.strlen(newlines),
            3,
            "Newlines should be counted"
        );

        string memory mixed = " \t\n ";
        assertEq(
            TestStringUtils.strlen(mixed),
            4,
            "Mixed whitespace should be counted"
        );
    }

    /**
     * Test strlen consistency with escape function
     */
    function testStrlenConsistencyWithEscape() public pure {
        string memory input = "Hello\nWorld";
        uint256 inputLength = TestStringUtils.strlen(input);

        string memory escaped = TestStringUtils.escape(input);
        uint256 escapedLength = TestStringUtils.strlen(escaped);

        // Original has 11 characters: "Hello\nWorld"
        assertEq(inputLength, 11, "Original string length should be correct");

        // Escaped has 12 characters: "Hello\\nWorld" (backslash adds 1)
        assertEq(
            escapedLength,
            12,
            "Escaped string should be longer due to escape sequence"
        );
        assertTrue(
            escapedLength > inputLength,
            "Escaped string should be longer than original"
        );
    }
}
