//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ReverseNamer} from "../../reverseRegistrar/ReverseNamer.sol";

contract MockReverseNamer {
    function registrarFromChain(
        uint256 chainId
    ) external pure returns (address) {
        return ReverseNamer.registrarFromChain(chainId);
    }
}

contract MockNamedOnce {
    constructor(string memory primary) {
        ReverseNamer.setName(primary);
    }
}
