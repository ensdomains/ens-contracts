// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/test/mocks/StringUtilsTest.sol";

/**
 * @title TestStringUtils
 * @dev Tests string utility functions for JSON-standard escaping of double quotes, backslashes, and newline characters
 */
contract TestStringUtils is Test {
    
    function setUp() public {
        // No setup needed for StringUtils tests
    }
    
    /**
     * Test 1: 'should escape double quote correctly based on JSON standard'
     * Tests double quote escaping according to JSON standard
     */
    function testShouldEscapeDoubleQuoteCorrectlyBasedOnJSONStandard() public pure {
        string memory input = 'My ENS is, "tanrikulu.eth"';
        string memory expected = 'My ENS is, \\"tanrikulu.eth\\"';
        string memory result = StringUtilsTest.testEscape(input);
        
        assertEq(result, expected, "Double quote escaping should match JSON standard");
    }
    
    /**
     * Test 2: 'should escape backslash correctly based on JSON standard'
     * Tests backslash escaping according to JSON standard
     */
    function testShouldEscapeBackslashCorrectlyBasedOnJSONStandard() public pure {
        string memory input = "Path\\to\\file";
        string memory expected = "Path\\\\to\\\\file";
        string memory result = StringUtilsTest.testEscape(input);
        
        assertEq(result, expected, "Backslash escaping should match JSON standard");
    }
    
    /**
     * Test 3: 'should escape new line character correctly based on JSON standard'
     * Tests newline character escaping according to JSON standard
     */
    function testShouldEscapeNewLineCharacterCorrectlyBasedOnJSONStandard() public pure {
        string memory input = "Line 1\nLine 2";
        string memory expected = "Line 1\\nLine 2";
        string memory result = StringUtilsTest.testEscape(input);
        
        assertEq(result, expected, "Newline escaping should match JSON standard");
    }
}