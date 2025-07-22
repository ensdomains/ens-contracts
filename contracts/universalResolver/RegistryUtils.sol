// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ENS} from "../registry/ENS.sol";
import {NameCoder} from "../utils/NameCoder.sol";

library RegistryUtils {
    /// @notice Find the resolver for `name[offset:]`.
    /// @dev Reverts `DNSDecodingFailed`.
    /// @param registry The ENS registry.
    /// @param name The DNS-encoded name to search.
    /// @param offset The offset into `name` to begin the search.
    /// @return resolver The resolver or `address(0)` if not found.
    /// @return node The namehash of `name[offset:]`.
    /// @return resolverOffset The offset into `name` corresponding to `resolver`.
    function findResolver(
        ENS registry,
        bytes memory name,
        uint256 offset
    )
        internal
        view
        returns (address resolver, bytes32 node, uint256 resolverOffset)
    {
        (bytes32 labelHash, uint256 next) = NameCoder.readLabel(name, offset);
        if (labelHash != bytes32(0)) {
            (
                address parentResolver,
                bytes32 parentNode,
                uint256 parentOffset
            ) = findResolver(registry, name, next);
            node = keccak256(abi.encode(parentNode, labelHash)); // assembly saves ~100 gas
            resolver = registry.resolver(node);
            return
                resolver != address(0)
                    ? (resolver, node, offset)
                    : (parentResolver, node, parentOffset);
        }
    }
}
