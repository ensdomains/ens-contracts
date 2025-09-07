// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractReverseResolver} from "./AbstractReverseResolver.sol";
import {ENS} from "../registry/ENS.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IStandaloneReverseRegistrar} from "../reverseRegistrar/IStandaloneReverseRegistrar.sol";
import {INameReverser} from "./INameReverser.sol";
import {COIN_TYPE_ETH} from "../utils/ENSIP19.sol";
import {HexUtils} from "../utils/HexUtils.sol";

/// @title Ethereum Reverse Resolver
/// @notice Reverses an EVM address using the first non-null response from the following sources:
///         1. `IStandaloneReverseRegistrar` for "addr.reverse"
///         2. `name()` from "{addr}.addr.reverse" in V1 Registry
///         3. `IStandaloneReverseRegistrar` for "default.reverse"
contract ETHReverseResolver is AbstractReverseResolver {
    /// @dev Namehash of "addr.reverse"
    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;

    /// @notice The registry contract.
    ENS public immutable registry;

    /// @notice The reverse registrar contract for "addr.reverse".
    IStandaloneReverseRegistrar public immutable addrRegistrar;

    /// @notice The reverse registrar contract for "default.reverse".
    IStandaloneReverseRegistrar public immutable defaultRegistrar;

    constructor(
        ENS ens,
        IStandaloneReverseRegistrar _addrRegistrar,
        IStandaloneReverseRegistrar _defaultRegistrar
    ) AbstractReverseResolver(COIN_TYPE_ETH, address(_addrRegistrar)) {
        registry = ens;
        addrRegistrar = _addrRegistrar;
        defaultRegistrar = _defaultRegistrar;
    }

    /// @inheritdoc AbstractReverseResolver
    function _resolveName(
        address addr
    ) internal view override returns (string memory name) {
        name = addrRegistrar.nameForAddr(addr);
        if (bytes(name).length == 0) {
            bytes32 node = keccak256(
                abi.encode(
                    ADDR_REVERSE_NODE,
                    keccak256(bytes(HexUtils.addressToHex(addr)))
                )
            );
            address resolver = registry.resolver(node);
            (bool ok, bytes memory v) = resolver.staticcall{gas: 100000}(
                abi.encodeCall(INameResolver.name, (node))
            );
            if (ok && v.length >= 32) {
                name = abi.decode(v, (string));
            }
            if (bytes(name).length == 0) {
                name = defaultRegistrar.nameForAddr(addr);
            }
        }
    }

    /// @inheritdoc INameReverser
    function resolveNames(
        address[] memory addrs
    ) external view returns (string[] memory names) {
        names = new string[](addrs.length);
        for (uint256 i; i < addrs.length; i++) {
            names[i] = _resolveName(addrs[i]);
        }
    }
}
