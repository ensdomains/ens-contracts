// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractUniversalResolver} from "./AbstractUniversalResolver.sol";
import {RegistryUtils, ENS} from "./RegistryUtils.sol";

contract UniversalResolver is AbstractUniversalResolver {
    ENS public immutable registry;

    constructor(
        ENS ens,
        string[] memory gateways
    ) AbstractUniversalResolver(gateways) {
        registry = ens;
    }

    /// @inheritdoc AbstractUniversalResolver
    function findResolver(
        bytes memory name
    ) public view override returns (address, bytes32, uint256) {
        return RegistryUtils.findResolver(registry, name, 0);
    }
}
