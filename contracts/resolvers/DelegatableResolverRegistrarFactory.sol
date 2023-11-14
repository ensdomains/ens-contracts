// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./DelegatableResolverRegistrar.sol";
import {ClonesWithImmutableArgs} from "clones-with-immutable-args/src/ClonesWithImmutableArgs.sol";

/**
 * A resolver factory that creates a dedicated resolver for each user
 */

contract DelegatableResolverRegistrarFactory {
    using ClonesWithImmutableArgs for address;

    DelegatableResolverRegistrar public implementation;
    event NewDelegatableResolver(address resolver, address owner);

    constructor(DelegatableResolverRegistrar _implementation) {
        implementation = _implementation;
    }

    /*
     * Create the unique address unique to the owner
     * @param address The address of the resolver owner
     * @return address The address of the newly created Resolver
     */
    function create(
        address registrar
    ) external returns (DelegatableResolverRegistrarFactory clone) {
        bytes memory data = abi.encodePacked(registrar);
        clone = DelegatableResolverRegistrar(
            address(implementation).clone2(data)
        );
        emit DelegatableResolverRegistrar(address(clone), registrar);
    }

    /*
     * Returns the unique address unique to the owner
     * @param address The address of the resolver owner
     * @return address The address of the newly created Resolver
     */
    function predictAddress(
        address registrar
    ) external returns (address clone) {
        bytes memory data = abi.encodePacked(registrar);
        clone = address(implementation).predictAddress(registrar);
    }
}
