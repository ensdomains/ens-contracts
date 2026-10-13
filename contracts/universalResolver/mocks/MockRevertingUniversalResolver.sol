// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    AbstractUniversalResolver,
    IGatewayProvider
} from "../AbstractUniversalResolver.sol";
import {RegistryUtils, ENS} from "../RegistryUtils.sol";

contract MockRevertingUniversalResolver is AbstractUniversalResolver {
    ENS public immutable registry;
    mapping(bytes name => bytes data) public revertData;
    constructor(
        ENS ens,
        IGatewayProvider batchGatewayProvider
    ) AbstractUniversalResolver(batchGatewayProvider) {
        registry = ens;
    }
    function setRevertData(bytes calldata name, bytes calldata data) external {
        revertData[name] = data;
    }
    function findResolver(
        bytes memory name
    ) public view override returns (address, bytes32, uint256) {
        bytes memory v = revertData[name];
        if (v.length > 0) {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
        return RegistryUtils.findResolver(registry, name, 0);
    }
}
