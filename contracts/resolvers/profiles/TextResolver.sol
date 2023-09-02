// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../ResolverBase.sol";
import "./ITextResolver.sol";

error TextIsLocked();

abstract contract TextResolver is ITextResolver, ResolverBase {
    mapping(uint64 => mapping(bytes32 => mapping(string => string))) versionable_texts;
    mapping(bytes32 => bool) text_locks;
    mapping(bytes32 => mapping(string => bool)) text_key_locks;

    event AllTextLocked(bytes32 indexed node);
    event TextLocked(bytes32 indexed node, string key);

    /**
     * Sets the text data associated with an ENS node and key.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     * @param key The key to set.
     * @param value The text data value to set.
     */
    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external virtual authorised(node) {
        if (isTextLocked(node, key)) {
            revert TextIsLocked();
        }
        versionable_texts[recordVersions[node]][node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    /**
     * Returns the text data associated with an ENS node and key.
     * @param node The ENS node to query.
     * @param key The text data key to query.
     * @return The associated text data.
     */
    function text(
        bytes32 node,
        string calldata key
    ) external view virtual override returns (string memory) {
        return versionable_texts[recordVersions[node]][node][key];
    }

    /**
     * Returns true if the text record has been locked for this ENS node.
     * @param node The ENS node to check.
     */
    function isTextLocked(
        bytes32 node,
        string calldata key
    ) public view virtual returns (bool) {
        return
            text_key_locks[node][key] || text_locks[node] || isAllLocked(node);
    }

    /**
     * Locks all text records for this ENS node.
     * @param node The node to lock.
     */
    function lockText(bytes32 node) public virtual authorised(node) {
        text_locks[node] = true;
        _setUnclearable(node);
        emit AllTextLocked(node);
    }

    /**
     * Locks a specific text key for this ENS node.
     * @param node The node to lock.
     */
    function lockText(
        bytes32 node,
        string calldata key
    ) public virtual authorised(node) {
        text_key_locks[node][key] = true;
        _setUnclearable(node);
        emit TextLocked(node, key);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(ITextResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
