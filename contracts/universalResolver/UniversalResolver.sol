// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractUniversalResolver, NameCoder} from "./AbstractUniversalResolver.sol";
import {ENS} from "../registry/ENS.sol";

contract UniversalResolver is AbstractUniversalResolver {
    ENS public immutable registry;

    constructor(
        ENS ens,
        string[] memory gateways
    ) AbstractUniversalResolver(gateways) {
        registry = ens;
    }

    /// @dev Find the resolver address for `name`.
    ///      Does not perform any validity checks.
    /// @param name The name to search.
    function findResolver(
        bytes memory name
    ) public view override returns (address, bytes32, uint256) {
        return _findResolver(name, 0);
    }

    /// @dev Efficiently find the resolver address for `name[offset:]`.
    /// @param name The name to search.
    /// @param offset The byte-offset into `name` to begin the search.
    /// @return resolver The address of the resolver.
    /// @return node The namehash of name corresponding to the resolver.
    /// @return offset_ The byte-offset into `name` of the name corresponding to the resolver.
    function _findResolver(
        bytes memory name,
        uint256 offset
    ) internal view returns (address resolver, bytes32 node, uint256 offset_) {
        (bytes32 labelHash, uint256 next) = NameCoder.readLabel(name, offset);
        if (labelHash != bytes32(0)) {
            (
                address parentResolver,
                bytes32 parentNode,
                uint256 parentOffset
            ) = _findResolver(name, next);
            node = keccak256(abi.encodePacked(parentNode, labelHash));
            resolver = registry.resolver(node);
            return
                resolver != address(0)
                    ? (resolver, node, offset)
                    : (parentResolver, node, parentOffset);
        }
    }
}
