// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {ENS} from "../registry/ENS.sol";
import {HexUtils} from "../utils/HexUtils.sol";

/// @notice ENSIP10 implementation for finding the resolver of a given name.
/// https://docs.ens.domains/ensip/10
abstract contract ENSIP10ResolverFinder {
    using HexUtils for bytes;

    /// @notice The ENS registry.
    ENS internal immutable _registry;

    /// @notice The name is not encoded correctly.
    error InvalidNameEncoding();

    /// @notice Sets the ENS registry.
    /// @param registry_ The ENS registry.
    constructor(ENS registry_) {
        _registry = registry_;
    }

    /// @notice Finds a resolver by recursively querying the registry, starting at the longest name and progressively
    /// removing labels until it finds a result.
    /// @param name The name to resolve, in DNS-encoded and normalised form.
    /// @return resolver The Resolver responsible for this name.
    /// @return namehash The namehash of the full name.
    /// @return finalOffset The offset of the first label with a resolver.
    function findResolver(
        bytes calldata name
    ) public view returns (address resolver, bytes32 namehash, uint256 finalOffset) {
        return _findResolver(name, 0);
    }

    /// @dev Finds a resolver recursively based on the offset input.
    function _findResolver(
        bytes calldata name,
        uint256 offset
    ) internal view returns (address, bytes32, uint256) {
        uint256 labelLength = uint256(uint8(name[offset]));
        if (labelLength == 0) {
            return (address(0), bytes32(0), offset);
        }
        uint256 nextLabel = offset + labelLength + 1;
        if (nextLabel > name.length) revert InvalidNameEncoding();

        bytes32 labelHash;
        // Check if the label is encoded
        if (
            labelLength == 66 &&
            // 0x5b == '['
            name[offset + 1] == 0x5b &&
            // 0x5d == ']'
            name[nextLabel - 1] == 0x5d
        ) {
            // Use the data within the square brackets as the labelhash (i.e. `[...labelhash]`)
            (labelHash, ) = bytes(name[offset + 2:nextLabel - 1])
                .hexStringToBytes32(0, 64);
        } else {
            labelHash = keccak256(name[offset + 1:nextLabel]);
        }
        (
            address parentresolver,
            bytes32 parentnode,
            uint256 parentoffset
        ) = _findResolver(name, nextLabel);
        bytes32 node = keccak256(abi.encodePacked(parentnode, labelHash));
        address resolver = _registry.resolver(node);
        if (resolver != address(0)) {
            return (resolver, node, offset);
        }
        return (parentresolver, node, parentoffset);
    }
}
