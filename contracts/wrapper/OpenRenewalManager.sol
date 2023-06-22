//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "../registry/ENS.sol";
import {ReverseClaimer} from "../reverseRegistrar/ReverseClaimer.sol";
import {INameWrapper} from "./INameWrapper.sol";

contract OpenRenewalManager is ReverseClaimer {
    INameWrapper immutable nameWrapper;

    constructor(
        ENS _ens,
        INameWrapper wrapperAddress
    ) ReverseClaimer(_ens, msg.sender) {
        nameWrapper = wrapperAddress;
    }

    function extendExpiry(
        bytes32 parentNode,
        bytes32 labelhash,
        uint64 expiry
    ) public returns (uint64) {
        nameWrapper.extendExpiry(parentNode, labelhash, expiry);
    }
}
