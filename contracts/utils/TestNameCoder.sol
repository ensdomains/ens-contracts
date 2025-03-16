// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NameCoder} from "./NameCoder.sol";

contract TestNameCoder {
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
