// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../ResolverBase.sol";
import "./IDataResolver.sol";
import "./ISupportedDataKeys.sol";

abstract contract DataResolver is
    IDataResolver,
    ISupportedDataKeys,
    ResolverBase
{
    mapping(bytes32 node => mapping(string key => bytes data))
        private dataStore;
    mapping(bytes32 node => string[] keys) private supportedDataKeysStore;
    mapping(bytes32 node => mapping(string key => bool)) private keyExists;

    /// @notice Sets the data associated with the key, `key` for a specific `node`.
    /// May only be called by the owner of that node in the ENS registry.
    /// @param node The node to update.
    /// @param key The key to set.
    /// @param value The arbitrary `bytes` data to set.
    function setData(
        bytes32 node,
        string calldata key,
        bytes calldata value
    ) external virtual authorised(node) {
        dataStore[node][key] = value;

        if (!keyExists[node][key]) {
            supportedDataKeysStore[node].push(key);
            keyExists[node][key] = true;
        }

        emit DataChanged(node, key, key, value);
    }

    /// @notice For a specific `node`, get the data associated with the key, `key`.
    /// @param node The node (namehash) for which data is being fetched.
    /// @param key The key.
    /// @return The associated arbitrary `bytes` data.
    function data(
        bytes32 node,
        string calldata key
    ) external view returns (bytes memory) {
        return dataStore[node][key];
    }

    /// @notice For a specific `node`, get an array of supported data keys.
    /// @param node The node (namehash).
    /// @return The keys for which we have associated data.
    function supportedDataKeys(
        bytes32 node
    ) external view returns (string[] memory) {
        return supportedDataKeysStore[node];
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IDataResolver).interfaceId ||
            interfaceID == type(ISupportedDataKeys).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
