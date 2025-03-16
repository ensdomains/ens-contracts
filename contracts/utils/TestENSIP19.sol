// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ENSIP19} from "./ENSIP19.sol";

contract TestENSIP19 {
    function reverseName(
        bytes memory encodedAddress,
        uint256 coinType
    ) external pure returns (string memory) {
        return ENSIP19.reverseName(encodedAddress, coinType);
    }
}
