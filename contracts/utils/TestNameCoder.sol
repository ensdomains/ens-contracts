// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NameCoder} from "./NameCoder.sol";

contract TestNameCoder {
    function nextLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (uint8, uint256) {
        return NameCoder.nextLabel(name, offset);
    }

    function prevLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (uint256) {
        return NameCoder.prevLabel(name, offset);
    }

    function countLabels(
        bytes memory name,
        uint256 offset
    ) external pure returns (uint256) {
        return NameCoder.countLabels(name, offset);
    }

    function readLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (bytes32, uint256) {
        return NameCoder.readLabel(name, offset);
    }

    function extractLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (string memory, uint256) {
        return NameCoder.extractLabel(name, offset);
    }

    function firstLabel(
        bytes memory name
    ) external pure returns (string memory) {
        return NameCoder.firstLabel(name);
    }

    function namehash(
        bytes memory name,
        uint256 offset
    ) external pure returns (bytes32 nameHash) {
        return NameCoder.namehash(name, offset);
    }

    function encode(
        string memory ens
    ) external pure returns (bytes memory dns) {
        return NameCoder.encode(ens);
    }

    function decode(
        bytes memory dns
    ) external pure returns (string memory ens) {
        return NameCoder.decode(dns);
    }

    function matchSuffix(
        bytes memory name,
        uint256 offset,
        bytes32 nodeSuffix
    ) external pure returns (bool, bytes32, uint256, uint256) {
        return NameCoder.matchSuffix(name, offset, nodeSuffix);
    }

    function ethName(string memory label) external pure returns (bytes memory) {
        return NameCoder.ethName(label);
    }

    function addLabel(
        bytes memory name,
        string memory label
    ) external pure returns (bytes memory) {
        return NameCoder.addLabel(name, label);
    }
}
