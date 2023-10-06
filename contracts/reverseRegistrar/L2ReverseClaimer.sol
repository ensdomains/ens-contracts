//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {ENS} from "../registry/ENS.sol";
import {IL2ReverseRegistrar} from "../reverseRegistrar/IL2ReverseRegistrar.sol";

contract L2ReverseClaimer {
    constructor(
        address l2ReverseRegistrarAddr,
        ENS reverseRegistrar,
        address claimant
    ) {
        IL2ReverseRegistrar reverseRegistrar = IL2ReverseRegistrar(
            l2ReverseRegistrarAddr
        );
        //reverseRegistrar.setName(claimant);
    }
}

// TODO: do we need a way of claiming a reverse node
// so that contracts can delegate ownership to an EoA/Smartcontract?
