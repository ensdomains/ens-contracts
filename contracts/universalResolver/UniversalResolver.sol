// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractUniversalResolver, IGatewayProvider} from "./AbstractUniversalResolver.sol";
import {RegistryUtils, ENS} from "./RegistryUtils.sol";
import {ReverseClaimer} from "../reverseRegistrar/ReverseClaimer.sol";

contract UniversalResolver is AbstractUniversalResolver, ReverseClaimer {
    ENS public immutable registry;

    constructor(
        address owner,
        ENS ens,
        IGatewayProvider batchGatewayProvider
    )
        AbstractUniversalResolver(batchGatewayProvider)
        ReverseClaimer(ens, owner)
    {
        registry = ens;
    }

    /// @inheritdoc AbstractUniversalResolver
    function findResolver(
        bytes memory name
    ) public view override returns (address, bytes32, uint256) {
        return RegistryUtils.findResolver(registry, name, 0);
    }
}
