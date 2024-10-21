//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {BytesUtils} from "./BytesUtils.sol";

contract TestBytesUtils {
    using BytesUtils for *;

    function readLabel(
        bytes calldata name,
        uint256 offset
    ) public pure returns (bytes32, uint256) {
        return name.readLabel(offset);
    }

    function namehash(
        bytes calldata name,
        uint256 offset
    ) public pure returns (bytes32) {
        return name.namehash(offset);
    }
}
