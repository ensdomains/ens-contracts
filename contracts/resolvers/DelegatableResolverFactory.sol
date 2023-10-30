// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./DelegatableResolver.sol";
import {ClonesWithImmutableArgs} from "clones-with-immutable-args/src/ClonesWithImmutableArgs.sol";

contract DelegatableResolverFactory {
    using ClonesWithImmutableArgs for address;

    DelegatableResolver public implementation;
    event newDelegatableResolver(address indexed resolver, address owner);

    constructor(DelegatableResolver implementation_) {
        implementation = implementation_;
    }

    function createClone2(
        address param1
    ) external returns (DelegatableResolver clone) {
        bytes memory data = abi.encodePacked(param1);
        clone = DelegatableResolver(address(implementation).clone2(data));
        emit newDelegatableResolver(address(clone), param1);
    }

    function predictAddress(address param1) external returns (address clone) {
        bytes memory data = abi.encodePacked(param1);
        clone = address(implementation).predictAddress(data);
    }
}
