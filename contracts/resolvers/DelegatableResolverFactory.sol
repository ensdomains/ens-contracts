// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./DelegatableResolver.sol";
import {ClonesWithImmutableArgs} from "clones-with-immutable-args/src/ClonesWithImmutableArgs.sol";

/**
 * A resolver factory that creates a dedicated resolver for each user
 */

contract DelegatableResolverFactory {
    using ClonesWithImmutableArgs for address;

    DelegatableResolver public implementation;
    event NewDelegatableResolver(address resolver, address owner);

    constructor(DelegatableResolver implementation_) {
        implementation = _implementation;
    }

    /*
     * Create the unique address unique to the owner
     * @param address The address of the resolver owner
     * @return address The address of the newly created Resolver
     */
    function create(
        address owner
    ) external returns (DelegatableResolver clone) {
        bytes memory data = abi.encodePacked(owner);
        clone = DelegatableResolver(address(implementation).clone2(data));
        emit newDelegatableResolver(address(clone), owner);
    }

    /*
     * Returns the unique address unique to the owner
     * @param address The address of the resolver owner
     * @return address The address of the newly created Resolver
     */
    function predictAddress(address owner) external returns (address clone) {
        bytes memory data = abi.encodePacked(owner);
        clone = address(implementation).predictAddress(data);
    }
}
