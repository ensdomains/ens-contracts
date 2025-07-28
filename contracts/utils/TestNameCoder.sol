// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NameCoder} from "./NameCoder.sol";

contract TestNameCoder {
    function nextLabel(
        bytes memory name,
        uint256 offset
    ) external pure returns (uint8 size, uint256 nextOffset) {
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
        returns (
            bytes32 labelHash,
            uint256 nextOffset,
            uint8 size,
            bool wasHashed
        )
    {
        (labelHash, nextOffset, size, wasHashed) = NameCoder.readLabel(
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

    function matchSuffix(
        bytes memory name,
        uint256 offset,
        bytes32 nodeSuffix
    )
        external
        pure
        returns (
            bool matched,
            bytes32 node,
            uint256 prevOffset,
            uint256 matchOffset
        )
    {
        return NameCoder.matchSuffix(name, offset, nodeSuffix);
    }
}
