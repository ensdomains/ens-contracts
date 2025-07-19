// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NameCoder} from "./NameCoder.sol";

contract TestNameCoder {
    function nextLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (uint256 size, uint256 nextOffset) {
        return NameCoder.nextLabel(name, offset);
    }

    function prevLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (uint256) {
        return NameCoder.prevLabel(name, offset);
    }

    function readLabel(
        bytes memory name,
        uint256 offset,
        bool parseHashed
    )
        external
        pure
        returns (bytes32 labelHash, bool wasHashed, uint256 nextOffset)
    {
        (labelHash, wasHashed, nextOffset) = NameCoder.readLabel(
            name,
            offset,
            parseHashed
        );
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
}
