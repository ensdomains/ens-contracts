//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {ENS} from "../registry/ENS.sol";
import {IReverseRegistrar} from "../reverseRegistrar/IL2ReverseRegistrar.sol";

contract L2ReverseClaimer {
    constructor(address reverseNode, ENS ens, address claimant) {
        IReverseRegistrar reverseRegistrar = IReverseRegistrar(
            ens.owner(reverseNode)
        );
        reverseRegistrar.claim(claimant);
    }
}
