// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {StringUtils} from "../../contracts/utils/StringUtils.sol";

contract TestStringUtils is Test {
    function test_strlen() external pure {
        _assertLen("", 0);
        _assertLen("0", 1);
        _assertLen("00", 2);
        _assertLen(hex"c280", 1); // 0x80
        _assertLen(hex"e0a080", 1); // 0x800
        _assertLen(hex"f0908080", 1); // 0x10000
        _assertLen(hex"f48fbfbf", 1); // 1114111
    }

    function test_escape() external pure {
        assertEq(
            StringUtils.escape('My ENS is, "tanrikulu.eth"'),
            'My ENS is, \\"tanrikulu.eth\\"'
        );
        assertEq(StringUtils.escape("Path\\to\\file"), "Path\\\\to\\\\file");
        assertEq(StringUtils.escape("Line 1\nLine 2"), "Line 1\\nLine 2");
    }

    function _assertLen(string memory s, uint256 n) internal pure {
        assertEq(StringUtils.strlen(s), n, s);
    }
}
