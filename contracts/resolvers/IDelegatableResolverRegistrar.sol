// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IDelegatableResolverRegistrar {
    function register(bytes memory name, address operator) external;
}
