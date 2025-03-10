// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {BytesUtils} from "../../contracts/utils/BytesUtils.sol";
import {HexUtils} from "../../contracts/utils/HexUtils.sol";

// https://adraffy.github.io/keccak.js/test/demo.html#algo=namehash&s=eth&escape=1&encoding=utf8
bytes32 constant ETH_NODE = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

/// forge-config: default.allow_internal_expect_revert = true
contract TestBytesUtils is Test {
    function test_keccak_empty() external pure {
        assertEq(BytesUtils.keccak("", 0, 0), keccak256(""));
    }

    function testFuzz_keccak(bytes memory v) external pure {
        assertEq(BytesUtils.keccak(v, 0, v.length), keccak256(v));
    }

    function testFuzz_equals(bytes memory v) external pure {
        assertTrue(BytesUtils.equals(v, v));
    }

    function testFuzz_equals_withStart(
        bytes memory v,
        bytes memory pad
    ) external pure {
        assertTrue(BytesUtils.equals(abi.encodePacked(pad, v), pad.length, v));
    }

    function testFuzz_equals_withSeparateStarts(
        bytes memory v,
        bytes memory pad1,
        bytes memory pad2
    ) external pure {
        assertTrue(
            BytesUtils.equals(
                abi.encodePacked(pad1, v),
                pad1.length,
                abi.encodePacked(pad2, v),
                pad2.length
            )
        );
    }

    function testFuzz_equals_slice(
        bytes memory v,
        bytes memory pad
    ) external pure {
        bytes memory u = abi.encodePacked(pad, v);
        assertTrue(BytesUtils.equals(u, pad.length, u, pad.length, v.length));
    }

    function testFuzz_compare_identity(bytes memory v) external pure {
        assertEq(BytesUtils.compare(v, v), 0);
    }

    function testFuzz_compare_slice(
        bytes memory v1,
        bytes memory v2,
        bytes memory pad1,
        bytes memory pad2
    ) external pure {
        assertEq(
            BytesUtils.compare(
                abi.encodePacked(pad1, v1),
                pad1.length,
                v1.length,
                abi.encodePacked(pad2, v2),
                pad2.length,
                v2.length
            ),
            BytesUtils.compare(v1, v2)
        );
    }

    function testFuzz_compare_reflexivity(
        bytes memory v1,
        bytes memory v2
    ) external pure {
        assertEq(BytesUtils.compare(v1, v2), -BytesUtils.compare(v2, v1));
    }

    function testFuzz_substring(
        bytes memory v1,
        bytes memory v2
    ) external pure {
        bytes memory v = abi.encodePacked(v1, v2);
        assertEq(BytesUtils.substring(v, 0, v1.length), v1);
        assertEq(BytesUtils.substring(v, v1.length, v2.length), v2);
    }

    function testFuzz_readUint8(bytes memory v, uint8 x) external pure {
        assertEq(BytesUtils.readUint8(abi.encodePacked(v, x), v.length), x);
    }

    function testFuzz_readUint16(bytes memory v, uint16 x) external pure {
        assertEq(BytesUtils.readUint16(abi.encodePacked(v, x), v.length), x);
    }

    function testFuzz_readUint32(bytes memory v, uint32 x) external pure {
        assertEq(BytesUtils.readUint32(abi.encodePacked(v, x), v.length), x);
    }

    function testFuzz_readBytes20(bytes memory v, bytes20 x) external pure {
        assertEq(BytesUtils.readBytes20(abi.encodePacked(v, x), v.length), x);
    }

    function test_base32HexDecodeWord() external pure {
        assertEq(
            BytesUtils.base32HexDecodeWord("C4", 0, 2),
            bytes32(bytes1("a"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord("C5GG", 0, 4),
            bytes32(bytes2("aa"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord("C5GM2", 0, 5),
            bytes32(bytes3("aaa"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord("C5GM2O8", 0, 7),
            bytes32(bytes4("aaaa"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord("C5GM2OB1", 0, 8),
            bytes32(bytes5("aaaaa"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord("c5gm2Ob1", 0, 8),
            bytes32(bytes5("aaaaa"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord(
                "C5H66P35CPJMGQBADDM6QRJFE1ON4SRKELR7EU3PF8",
                0,
                42
            ),
            bytes32(bytes26("abcdefghijklmnopqrstuvwxyz"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord(
                "c5h66p35cpjmgqbaddm6qrjfe1on4srkelr7eu3pf8",
                0,
                42
            ),
            bytes32(bytes26("abcdefghijklmnopqrstuvwxyz"))
        );
        assertEq(
            BytesUtils.base32HexDecodeWord(
                "C5GM2OB1C5GM2OB1C5GM2OB1C5GM2OB1C5GM2OB1C5GM2OB1C5GG",
                0,
                52
            ),
            bytes32("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
        assertEq(
            BytesUtils.base32HexDecodeWord(
                " bst4hlje7r0o8c8p4o8q582lm0ejmiqt\x07matoken\x03xyz\x00",
                1,
                32
            ),
            bytes32(hex"5f3a48d66e3ec18431192611a2a055b01d3b4b5d")
        );
    }

    function test_readLabel_vitalik_eth() external {
        // https://adraffy.github.io/keccak.js/test/demo.html#algo=dns-encoded&s=vitalik.eth&escape=1&encoding=utf8
        bytes memory dns = hex"07766974616c696b0365746800";
        uint256 pos;
        bytes32 labelHash;
        (labelHash, pos) = BytesUtils.readLabel(dns, pos);
        assertEq(labelHash, keccak256("vitalik"));
        (labelHash, pos) = BytesUtils.readLabel(dns, pos);
        assertEq(labelHash, keccak256("eth"));
        (labelHash, pos) = BytesUtils.readLabel(dns, pos);
        assertEq(labelHash, bytes32(0));
        assertEq(pos, dns.length);
        vm.expectRevert(); // "readLabel: Index out of bounds"
        (labelHash, pos) = BytesUtils.readLabel(dns, pos);
    }

    function testFuzz_readLabel(string memory label) external pure {
        vm.assume(bytes(label).length > 0 && bytes(label).length < 256);
        bytes memory name = _nameDotEth(label);
        (bytes32 labelHash, uint256 offset) = BytesUtils.readLabel(name, 0);
        assertEq(labelHash, keccak256(bytes(label)));
        assertEq(offset, name.length - 5); // "3eth0"
    }

    function test_namehash_empty() external pure {
        assertEq(BytesUtils.namehash(hex"00", 0), bytes32(0));
    }

    function testFuzz_namehash(string memory label) external pure {
        vm.assume(bytes(label).length > 0 && bytes(label).length < 256);
        assertEq(
            BytesUtils.namehash(_nameDotEth(label), 0),
            keccak256(abi.encodePacked(ETH_NODE, keccak256(bytes(label))))
        );
    }

    function _nameDotEth(
        string memory label
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(uint8(bytes(label).length), label, "\x03eth\x00");
    }
}
