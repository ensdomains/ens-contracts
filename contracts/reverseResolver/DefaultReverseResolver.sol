// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractReverseResolver} from "./AbstractReverseResolver.sol";
import {IStandaloneReverseRegistrar} from "../reverseRegistrar/IStandaloneReverseRegistrar.sol";
import {INameReverser} from "./INameReverser.sol";
import {COIN_TYPE_DEFAULT} from "../utils/ENSIP19.sol";

/// @title Default Reverse Resolver
/// @notice Reverses an EVM address using the `IStandaloneReverseRegistrar` for "default.reverse".
contract DefaultReverseResolver is AbstractReverseResolver {
    /// @notice The reverse registrar contract for "default.reverse".
    IStandaloneReverseRegistrar public immutable defaultRegistrar;

    constructor(
        IStandaloneReverseRegistrar _defaultRegistrar
    ) AbstractReverseResolver(COIN_TYPE_DEFAULT, address(_defaultRegistrar)) {
        defaultRegistrar = _defaultRegistrar;
    }

    /// @inheritdoc AbstractReverseResolver
    function _resolveName(
        address addr
    ) internal view override returns (string memory name) {
        name = defaultRegistrar.nameForAddr(addr);
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
