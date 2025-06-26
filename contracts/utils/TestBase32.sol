// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Base32} from "../../contracts/utils/Base32.sol";

contract TestBase32 {
    function testRADIX(
        bytes memory encoded,
        bytes memory expect
    ) private pure returns (bytes memory v) {
        bool ok;
        (ok, v) = Base32.tryDecode(encoded, 0, encoded.length, Base32.RADIX);
        require(ok && keccak256(v) == keccak256(expect), string(encoded));
    }

    function test_tryDecode_RADIX() external pure {
        testRADIX("C4", "a");
        {
            (bool ok, bytes memory v) = Base32.tryDecode(
                "C4",
                0,
                2,
                Base32.RADIX
            );
            require(ok && bytes32(v) == bytes1("a"), "a again");
        }
        testRADIX("C5GG", "aa");
        testRADIX("C5GM2", "aaa");
        testRADIX("C5GM2O8", "aaaa");
        testRADIX("C5GM2OB1", "aaaaa");
        testRADIX("c5gm2Ob1", "aaaaa");
        testRADIX(
            "C5H66P35CPJMGQBADDM6QRJFE1ON4SRKELR7EU3PF8",
            "abcdefghijklmnopqrstuvwxyz"
        );
        testRADIX(
            "c5h66p35cpjmgqbaddm6qrjfe1on4srkelr7eu3pf8",
            "abcdefghijklmnopqrstuvwxyz"
        );
        testRADIX(
            "C5GM2OB1C5GM2OB1C5GM2OB1C5GM2OB1C5GM2OB1C5GM2OB1C5GG",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        {
            (bool ok, bytes memory v) = Base32.tryDecode(
                " bst4hlje7r0o8c8p4o8q582lm0ejmiqt\x07matoken\x03xyz\x00",
                1,
                32,
                Base32.RADIX
            );
            require(
                ok &&
                    bytes32(v) ==
                    bytes20(0x5F3a48D66E3eC18431192611a2a055b01D3b4b5D),
                "real"
            );
        }
    }

    function test_RADIX() external pure {
        require(Base32.RADIX("0") == 0, "0");
        require(Base32.RADIX("1") == 1, "1");
        require(Base32.RADIX("2") == 2, "2");
        require(Base32.RADIX("3") == 3, "3");
        require(Base32.RADIX("4") == 4, "4");
        require(Base32.RADIX("5") == 5, "5");
        require(Base32.RADIX("6") == 6, "6");
        require(Base32.RADIX("7") == 7, "7");
        require(Base32.RADIX("8") == 8, "8");
        require(Base32.RADIX("9") == 9, "9");

        require(Base32.RADIX("a") == 10, "a");
        require(Base32.RADIX("b") == 11, "b");
        require(Base32.RADIX("c") == 12, "c");
        require(Base32.RADIX("d") == 13, "d");
        require(Base32.RADIX("e") == 14, "e");
        require(Base32.RADIX("f") == 15, "f");
        require(Base32.RADIX("g") == 16, "g");
        require(Base32.RADIX("h") == 17, "h");
        require(Base32.RADIX("i") == 18, "i");
        require(Base32.RADIX("j") == 19, "j");
        require(Base32.RADIX("k") == 20, "k");
        require(Base32.RADIX("l") == 21, "l");
        require(Base32.RADIX("m") == 22, "m");
        require(Base32.RADIX("n") == 23, "n");
        require(Base32.RADIX("o") == 24, "o");
        require(Base32.RADIX("p") == 25, "p");
        require(Base32.RADIX("q") == 26, "q");
        require(Base32.RADIX("r") == 27, "r");
        require(Base32.RADIX("s") == 28, "s");
        require(Base32.RADIX("t") == 29, "t");
        require(Base32.RADIX("u") == 30, "u");
        require(Base32.RADIX("v") == 31, "v");

        require(Base32.RADIX("A") == 10, "A");
        require(Base32.RADIX("B") == 11, "B");
        require(Base32.RADIX("C") == 12, "C");
        require(Base32.RADIX("D") == 13, "D");
        require(Base32.RADIX("E") == 14, "E");
        require(Base32.RADIX("F") == 15, "F");
        require(Base32.RADIX("G") == 16, "G");
        require(Base32.RADIX("H") == 17, "H");
        require(Base32.RADIX("I") == 18, "I");
        require(Base32.RADIX("J") == 19, "J");
        require(Base32.RADIX("K") == 20, "K");
        require(Base32.RADIX("L") == 21, "L");
        require(Base32.RADIX("M") == 22, "M");
        require(Base32.RADIX("N") == 23, "N");
        require(Base32.RADIX("O") == 24, "O");
        require(Base32.RADIX("P") == 25, "P");
        require(Base32.RADIX("Q") == 26, "Q");
        require(Base32.RADIX("R") == 27, "R");
        require(Base32.RADIX("S") == 28, "S");
        require(Base32.RADIX("T") == 29, "T");
        require(Base32.RADIX("U") == 30, "U");
        require(Base32.RADIX("V") == 31, "V");

        require(Base32.RADIX("$") == 32, "$");
    }

    function test_RFC4648() external pure {
        require(Base32.RFC4648("a") == 0, "a");
        require(Base32.RFC4648("b") == 1, "b");
        require(Base32.RFC4648("c") == 2, "c");
        require(Base32.RFC4648("d") == 3, "d");
        require(Base32.RFC4648("e") == 4, "e");
        require(Base32.RFC4648("f") == 5, "f");
        require(Base32.RFC4648("g") == 6, "g");
        require(Base32.RFC4648("h") == 7, "h");
        require(Base32.RFC4648("i") == 8, "i");
        require(Base32.RFC4648("j") == 9, "j");
        require(Base32.RFC4648("k") == 10, "k");
        require(Base32.RFC4648("l") == 11, "l");
        require(Base32.RFC4648("m") == 12, "m");
        require(Base32.RFC4648("n") == 13, "n");
        require(Base32.RFC4648("o") == 14, "o");
        require(Base32.RFC4648("p") == 15, "p");
        require(Base32.RFC4648("q") == 16, "q");
        require(Base32.RFC4648("r") == 17, "r");
        require(Base32.RFC4648("s") == 18, "s");
        require(Base32.RFC4648("t") == 19, "t");
        require(Base32.RFC4648("u") == 20, "u");
        require(Base32.RFC4648("v") == 21, "v");
        require(Base32.RFC4648("w") == 22, "w");
        require(Base32.RFC4648("x") == 23, "x");
        require(Base32.RFC4648("y") == 24, "y");
        require(Base32.RFC4648("z") == 25, "z");

        require(Base32.RFC4648("A") == 0, "A");
        require(Base32.RFC4648("B") == 1, "B");
        require(Base32.RFC4648("C") == 2, "C");
        require(Base32.RFC4648("D") == 3, "D");
        require(Base32.RFC4648("E") == 4, "E");
        require(Base32.RFC4648("F") == 5, "F");
        require(Base32.RFC4648("G") == 6, "G");
        require(Base32.RFC4648("H") == 7, "H");
        require(Base32.RFC4648("I") == 8, "I");
        require(Base32.RFC4648("J") == 9, "J");
        require(Base32.RFC4648("K") == 10, "K");
        require(Base32.RFC4648("L") == 11, "L");
        require(Base32.RFC4648("M") == 12, "M");
        require(Base32.RFC4648("N") == 13, "N");
        require(Base32.RFC4648("O") == 14, "O");
        require(Base32.RFC4648("P") == 15, "P");
        require(Base32.RFC4648("Q") == 16, "Q");
        require(Base32.RFC4648("R") == 17, "R");
        require(Base32.RFC4648("S") == 18, "S");
        require(Base32.RFC4648("T") == 19, "T");
        require(Base32.RFC4648("U") == 20, "U");
        require(Base32.RFC4648("V") == 21, "V");
        require(Base32.RFC4648("W") == 22, "W");
        require(Base32.RFC4648("X") == 23, "X");
        require(Base32.RFC4648("Y") == 24, "Y");
        require(Base32.RFC4648("Z") == 25, "Z");

        require(Base32.RFC4648("2") == 26, "2");
        require(Base32.RFC4648("3") == 27, "3");
        require(Base32.RFC4648("4") == 28, "4");
        require(Base32.RFC4648("5") == 29, "5");
        require(Base32.RFC4648("6") == 30, "6");
        require(Base32.RFC4648("7") == 31, "7");

        require(Base32.RFC4648("$") == 32, "$");
    }
}
