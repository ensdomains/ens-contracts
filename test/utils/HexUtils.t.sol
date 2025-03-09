// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {HexUtils} from "../../contracts/utils/HexUtils.sol";

contract TestHexUtils is Test {
    function test_hexStringToBytes32() external pure {
        (bytes32 x, ) = HexUtils.hexStringToBytes32(
            "5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da",
            0,
            64
        );
        assertEq(
            x,
            0x5cee339e13375638553bdf5a6e36ba80fb9f6a4f0783680884d92b558aa471da
        );
    }

    function test_unpaddedUintToHex() external pure {
        assertEq(HexUtils.unpaddedUintToHex(0, true), "0");
        assertEq(HexUtils.unpaddedUintToHex(0, false), "00");
        assertEq(HexUtils.unpaddedUintToHex(0xf, true), "f");
        assertEq(HexUtils.unpaddedUintToHex(0xf, false), "0f");
        assertEq(HexUtils.unpaddedUintToHex(0xff, true), "ff");
        assertEq(HexUtils.unpaddedUintToHex(0xff, false), "ff");
    }

    function test_hexToAddressExactSize() external pure {
        (, bool ok) = HexUtils.hexToAddress(new bytes(32), 0, 39);
        assertFalse(ok);
    }

    /// forge-config: default.allow_internal_expect_revert = true
    function test_hexToBytesRagged() external {
        vm.expectRevert(); //abi.encodeWithSignature("Error(string)", "Invalid string length"));
        HexUtils.hexToBytes("f", 0, 1);
    }

    /// forge-config: default.allow_internal_expect_revert = true
    function test_hexToBytesBeyondStart() external {
        vm.expectRevert(new bytes(0));
        HexUtils.hexToBytes("", 10, 12);
    }

    /// forge-config: default.allow_internal_expect_revert = true
    function test_hexToBytesBeyondEnd() external {
        vm.expectRevert(new bytes(0));
        HexUtils.hexToBytes("", 0, 10);
    }

    function test_hexToBytes32RightAligned() external pure {
        (bytes32 x, ) = HexUtils.hexStringToBytes32("ff", 0, 2);
        assertEq(
            x,
            0x00000000000000000000000000000000000000000000000000000000000000ff
        );
    }

    function testFuzz_bytesToHexToBytes(
        bytes memory v0,
        uint8 offset
    ) external pure {
        bytes memory v1 = bytes(HexUtils.bytesToHex(v0));
        (bytes memory v2, ) = HexUtils.hexToBytes(
            bytes.concat(new bytes(offset), v1),
            offset,
            offset + v1.length
        );
        assertEq(v0, v2);
    }

    function testFuzz_hexStringToBytes32(bytes32 x0) external pure {
        bytes memory v = bytes(HexUtils.bytesToHex(abi.encodePacked(x0)));
        (bytes32 x1, ) = HexUtils.hexStringToBytes32(v, 0, v.length);
        assertEq(x0, x1);
    }

    function testFuzz_hexToAddress(address a0) external pure {
        bytes memory v = bytes(HexUtils.bytesToHex(abi.encodePacked(a0)));
        (address a1, ) = HexUtils.hexToAddress(v, 0, v.length);
        assertEq(a0, a1);
    }

    function testFuzz_unpaddedUintToHex(uint256 x) external pure {
        string memory s0 = Strings.toHexString(x);
        string memory s1 = HexUtils.unpaddedUintToHex(x, false);
        assertEq(s0, string.concat("0x", s1));
    }
}
