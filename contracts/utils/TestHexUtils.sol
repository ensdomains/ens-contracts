// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "./HexUtils.sol";

contract TestHexUtils {
    function hexToBytes(
        bytes calldata name,
        uint256 off,
        uint256 end
    ) public pure returns (bytes memory, bool) {
        return HexUtils.hexToBytes(name, off, end);
    }

    function hexStringToBytes32(
        bytes calldata name,
        uint256 off,
        uint256 end
    ) public pure returns (bytes32, bool) {
        return HexUtils.hexStringToBytes32(name, off, end);
    }

    function hexToAddress(
        bytes calldata input,
        uint256 off,
        uint256 end
    ) public pure returns (address, bool) {
        return HexUtils.hexToAddress(input, off, end);
    }

    function addressToHex(
        address addr
    ) external pure returns (string memory hexString) {
        return HexUtils.addressToHex(addr);
    }

    function unpaddedUintToHex(
        uint256 value,
        bool dropZeroNibble
    ) external pure returns (string memory hexString) {
        return HexUtils.unpaddedUintToHex(value, dropZeroNibble);
    }

    function bytesToHex(
        bytes memory v
    ) external pure returns (string memory hexString) {
        return HexUtils.bytesToHex(v);
    }
}
