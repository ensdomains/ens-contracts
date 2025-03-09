// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import {BytesUtilsEncrypted} from "../../contracts/utils/BytesUtilsEncrypted.sol";
import {HexUtils} from "../../contracts/utils/HexUtils.sol";

// https://adraffy.github.io/keccak.js/test/demo.html#algo=namehash&s=eth&escape=1&encoding=utf8
bytes32 constant ETH_NODE = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

contract TestBytesUtilsEncrypted is Test {
    function testFuzz_readLabel(string memory label) external pure {
        bytes32 h0 = keccak256(bytes(label));
		bytes memory name = _encryptedNameDotEth(h0);
        (bytes32 h1, uint256 offset) = BytesUtilsEncrypted.readLabel(name, 0);
        assertEq(h0, h1);
		assertEq(offset, name.length - 5);
    }

    function testFuzz_namehash(string memory label) external pure {
        bytes32 h0 = keccak256(bytes(label));
        assertEq(
            BytesUtilsEncrypted.namehash(_encryptedNameDotEth(h0), 0),
            keccak256(abi.encodePacked(ETH_NODE, h0))
        );
    }

    function _encryptedNameDotEth(
        bytes32 labelHash
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                uint8(66),
                "[",
                HexUtils.bytesToHex(abi.encodePacked(labelHash)),
                "]\x03eth\x00"
            );
    }
}
