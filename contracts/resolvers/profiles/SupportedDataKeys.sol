// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../ResolverBase.sol";
import "./ISupportedDataKeys.sol";

/// @notice Mixin implementing the optional ISupportedDataKeys interface for ENSIP-24.
///     Use alongside the DataResolver.sol, and call _addSupportedKey() within the _afterSetData()
///     hook to register a key as being supported.
abstract contract SupportedDataKeys is
    ISupportedDataKeys,
    ResolverBase
{
    mapping(uint64 => mapping(bytes32 node => string[] keys)) private versionable_supportedDataKeysStore;
    mapping(uint64 => mapping(bytes32 node => mapping(string key => bool))) private versionable_keyExists;

    /// @notice For a specific `node`, get an array of supported data keys.
    /// @param node The node (namehash).
    /// @return The keys for which we have associated data.
    function supportedDataKeys(
        bytes32 node
    ) external view returns (string[] memory) {
        return versionable_supportedDataKeysStore[recordVersions[node]][node];
    }

    /// @dev Call this to register a key as supported.
    function _addSupportedKey(bytes32 node, string memory key) internal virtual {
        uint64 version = recordVersions[node];
        if (!versionable_keyExists[version][node][key]) {
            versionable_supportedDataKeysStore[version][node].push(key);
            versionable_keyExists[version][node][key] = true;
        }
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(ISupportedDataKeys).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
