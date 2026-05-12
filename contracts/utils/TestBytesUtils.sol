// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BytesUtils} from "./BytesUtils.sol";

contract TestBytesUtils {
    using BytesUtils for *;

    function test_keccak() public pure {
        require(
            "".keccak(0, 0) ==
                bytes32(
                    0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
                ),
            "Incorrect hash of empty string"
        );
        require(
            "foo".keccak(0, 3) ==
                bytes32(
                    0x41b1a0649752af1b28b3dc29a1556eee781e4a4c3a1f7f53f90fa834de098c4d
                ),
            "Incorrect hash of 'foo'"
        );
        require(
            "foo".keccak(0, 0) ==
                bytes32(
                    0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
                ),
            "Incorrect hash of empty string"
        );
    }

    function test_equals() public pure {
        require("hello".equals("hello"), "String equality");
        require(!"hello".equals("goodbye"), "String inequality");
        require("hello".equals(1, "ello"), "Substring to string equality");
        require(
            "hello".equals(1, "jello", 1, 4),
            "Substring to substring equality"
        );
        require(
            "zhello".equals(1, "abchello", 3),
            "Compare different value with multiple length"
        );
        require(
            !"0x0102030000".equals(0, "0x010203"),
            "Compare with offset and trailing bytes"
        );
    }

    function test_compare_partial() public pure {
        require("xax".compare(1, 1, "xxbxx", 2, 1) < 0, "Compare same length");
        require(
            "xax".compare(1, 1, "xxabxx", 2, 2) < 0,
            "Compare different length"
        );
        require(
            "xax".compare(1, 1, "xxaxx", 2, 1) == 0,
            "Compare same with different offset"
        );
        require(
            "01234567890123450123456789012345ab".compare(
                0,
                33,
                "01234567890123450123456789012345aa",
                0,
                33
            ) == 0,
            "Compare different long strings same length smaller partial length which must be equal"
        );
        require(
            "01234567890123450123456789012345ab".compare(
                0,
                33,
                "01234567890123450123456789012345aa",
                0,
                34
            ) < 0,
            "Compare long strings same length different partial length"
        );
        require(
            "0123456789012345012345678901234a".compare(
                0,
                32,
                "0123456789012345012345678901234b",
                0,
                32
            ) < 0,
            "Compare strings exactly 32 characters long"
        );
    }

    function test_compare() public pure {
        require("a".compare("a") == 0, "a == a");
        require("a".compare("b") < 0, "a < b");
        require("b".compare("a") > 0, "b > a");
        require("aa".compare("ab") < 0, "aa < ab");
        require("a".compare("aa") < 0, "a < aa");
        require("aa".compare("a") > 0, "aa > a");
        bytes memory v = "123456789012345678901234567890123"; // 33
        require(v.compare(v) == 0, "long == long");
        require(v.compare(abi.encodePacked("0", v)) > 0, "long > 0long");
        require(v.compare(abi.encodePacked(v, "0")) < 0, "long < long0");
        require(
            abi.encodePacked(type(int256).min).compare(
                abi.encodePacked(type(int256).max)
            ) > 0,
            "Compare maximum difference"
        );
    }

    function test_copyBytes() public pure {
        bytes memory v = "0123456789abcdef0123456789abcdef";
        {
            bytes memory u = new bytes(5);
            BytesUtils.copyBytes(v, 0, u, 0, u.length);
            require(keccak256(u) == keccak256("01234"), "5");
        }
        {
            bytes memory u = new bytes(6);
            BytesUtils.copyBytes(v, 1, u, 0, u.length);
            require(keccak256(u) == keccak256("123456"), "6");
        }
        {
            bytes memory u = new bytes(v.length);
            BytesUtils.copyBytes(v, 0, u, 0, u.length);
            require(keccak256(u) == keccak256(v), "all");
        }
    }

    // this uses copyBytes() underneath
    function test_substring() public pure {
        bytes memory v = "abc";
        require(keccak256(v.substring(0, 0)) == keccak256(""), "[]abc");
        require(keccak256(v.substring(0, 2)) == keccak256("ab"), "[ab]c");
        require(keccak256(v.substring(1, 2)) == keccak256("bc"), "a[bc]");
        require(keccak256(v.substring(0, 3)) == keccak256("abc"), "[abc]");
    }

    function testFail_substring_overflow() public pure {
        "".substring(0, 1);
    }

    function test_readUint8() public pure {
        bytes memory v = "abc";
        require(v.readUint8(0) == uint8(bytes1("a")), "0");
        require(v.readUint8(1) == uint8(bytes1("b")), "1");
        require(v.readUint8(2) == uint8(bytes1("c")), "2");
    }

    function test_readUint16() public pure {
        bytes memory v = "abcd";
        require(v.readUint16(0) == uint16(bytes2("ab")), "0");
        require(v.readUint16(1) == uint16(bytes2("bc")), "1");
        require(v.readUint16(2) == uint16(bytes2("cd")), "2");
    }

    function test_readUint32() public pure {
        bytes memory v = "0123456789abc";
        require(v.readUint32(0) == uint32(bytes4("0123")), "0");
        require(v.readUint32(4) == uint32(bytes4("4567")), "4");
        require(v.readUint32(8) == uint32(bytes4("89ab")), "8");
    }

    function test_readBytes20() public pure {
        bytes memory v = "0123456789abcdef0123456789abcdef";
        bytes22 x = 0x30313233343536373839616263646566303132333435;
        require(v.readBytes20(0) == bytes20(x), "0");
        require(v.readBytes20(1) == bytes20(x << 8), "1");
        require(v.readBytes20(2) == bytes20(x << 16), "2");
    }

    function test_readBytes32() public pure {
        bytes memory v = "0123456789abcdef0123456789abcdef\x00\x00";
        bytes32 x = 0x3031323334353637383961626364656630313233343536373839616263646566;
        require(v.readBytes32(0) == x, "0");
        require(v.readBytes32(1) == x << 8, "1");
        require(v.readBytes32(2) == x << 16, "2");
    }

    function test_readBytesN() public pure {
        bytes memory v = "0123456789abcdef0123456789abcdef";
        bytes32 x = 0x3031323334353637383961626364656630313233343536373839616263646566;
        require(v.readBytesN(0, 0) == 0, "0");
        require(v.readBytesN(0, 1) == bytes1(x), "1");
        require(v.readBytesN(0, 2) == bytes2(x), "2");
        require(v.readBytesN(0, 3) == bytes3(x), "3");
        require(v.readBytesN(0, 4) == bytes4(x), "4");
        require(v.readBytesN(0, 5) == bytes5(x), "5");
        require(v.readBytesN(0, 6) == bytes6(x), "6");
        require(v.readBytesN(0, 7) == bytes7(x), "7");
        require(v.readBytesN(0, 8) == bytes8(x), "8");
        require(v.readBytesN(0, 9) == bytes9(x), "9");
        require(v.readBytesN(0, 10) == bytes10(x), "10");
        require(v.readBytesN(0, 11) == bytes11(x), "11");
        require(v.readBytesN(0, 12) == bytes12(x), "12");
        require(v.readBytesN(0, 13) == bytes13(x), "13");
        require(v.readBytesN(0, 14) == bytes14(x), "14");
        require(v.readBytesN(0, 15) == bytes15(x), "15");
        require(v.readBytesN(0, 16) == bytes16(x), "16");
        require(v.readBytesN(0, 17) == bytes17(x), "17");
        require(v.readBytesN(0, 18) == bytes18(x), "18");
        require(v.readBytesN(0, 19) == bytes19(x), "19");
        require(v.readBytesN(0, 20) == bytes20(x), "20");
        require(v.readBytesN(0, 21) == bytes21(x), "21");
        require(v.readBytesN(0, 22) == bytes22(x), "22");
        require(v.readBytesN(0, 23) == bytes23(x), "23");
        require(v.readBytesN(0, 24) == bytes24(x), "24");
        require(v.readBytesN(0, 25) == bytes25(x), "25");
        require(v.readBytesN(0, 26) == bytes26(x), "26");
        require(v.readBytesN(0, 27) == bytes27(x), "27");
        require(v.readBytesN(0, 28) == bytes28(x), "28");
        require(v.readBytesN(0, 29) == bytes29(x), "29");
        require(v.readBytesN(0, 30) == bytes30(x), "30");
        require(v.readBytesN(0, 31) == bytes31(x), "31");
        require(v.readBytesN(0, 32) == x, "32");
        require(v.readBytesN(1, 31) == bytes32(x) << 8, "1+31");
        require(v.readBytesN(31, 1) == bytes32(x) << 248, "31+1");
    }

    function testFail_readBytesN_overflow() public pure {
        "".readBytesN(0, 1);
    }

    function testFail_readBytesN_largeN() public pure {
        new bytes(64).readBytesN(0, 33);
    }

    function test_find() public pure {
        bytes memory v = "0123456789abcdef0123456789abcdef";
        require(v.find(0, v.length, "0") == 0, "0");
        require(v.find(1, v.length, "0") == 16, "2nd 0");
        require(v.find(0, v.length, "z") == type(uint256).max, "z");
        require(v.find(0, v.length, "A") == type(uint256).max, "A");
        require(v.find(0, 10, "a") == type(uint256).max, "a");
    }

    function test_includes() public pure {
        bytes memory v = new bytes(256);
        for (uint256 i = 1; i < 256; i++) {
            bytes1 x = bytes1(uint8(i));
            require(!"".includes(0, 0, x), "empty");
            v[i] = x;
            require(!v.includes(0, i, x), "before");
            require(!v.includes(i + 1, 255 - i, x), "after");
            require(v.includes(i, 1, x), "at");
            require(v.includes(0, i + 1, x), "before+1");
            require(v.includes(i, 256 - i, x), "after+1");
            v[0] = x;
            require(!v.includes(1, i - 1, x), "skip");
            require(!v.includes(i, 0, x), "i+empty");
        }
    }

    function testFail_includes_overflow() public pure {
        "".includes(0, 1, 0);
    }

    function testFail_includes_overflow2() public pure {
        "".includes(1, 0, 0);
    }

    function test_hasZeroByte() public pure {
        require(0.hasZeroByte());
        for (uint256 i; i < 32; ++i) {
            uint256 x = ~uint256(0);
            x ^= 255 << (i << 3);
            require(x.hasZeroByte());
            x |= 1 << (i << 3);
            require(!x.hasZeroByte());
        }
        for (uint256 i = 1; i < 256; i++) {
            require(!(~(1 << i)).hasZeroByte());
        }
    }
}
