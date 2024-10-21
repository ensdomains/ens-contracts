//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {HexUtils} from "./HexUtils.sol";

contract TestHexUtils {
    using HexUtils for *;

    function hexToBytes(
        bytes calldata name,
        uint256 idx,
        uint256 lastInx
    ) public pure returns (bytes memory, bool) {
        return name.hexToBytes(idx, lastInx);
    }

    function hexStringToBytes32(
        bytes calldata name,
        uint256 idx,
        uint256 lastInx
    ) public pure returns (bytes32, bool) {
        return name.hexStringToBytes32(idx, lastInx);
    }

    function hexToAddress(
        bytes calldata input,
        uint256 idx,
        uint256 lastInx
    ) public pure returns (address, bool) {
        return input.hexToAddress(idx, lastInx);
    }
}
