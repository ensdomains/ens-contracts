// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../ResolverBase.sol";
import "./INameResolver.sol";

error NameIsLocked();

abstract contract NameResolver is INameResolver, ResolverBase {
    mapping(uint64 => mapping(bytes32 => string)) versionable_names;
    mapping(bytes32 => bool) name_locks;

    event NameLocked(bytes32 indexed node);

    /**
     * Sets the name associated with an ENS node, for reverse records.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     */
    function setName(
        bytes32 node,
        string calldata newName
    ) external virtual authorised(node) {
        if (isNameLocked(node)) {
            revert NameIsLocked();
        }
        versionable_names[recordVersions[node]][node] = newName;
        emit NameChanged(node, newName);
    }

    /**
     * Returns the name associated with an ENS node, for reverse records.
     * Defined in EIP181.
     * @param node The ENS node to query.
     * @return The associated name.
     */
    function name(
        bytes32 node
    ) external view virtual override returns (string memory) {
        return versionable_names[recordVersions[node]][node];
    }

    /**
     * Returns true if the name has been locked for this ENS node.
     * @param node The ENS node to check.
     */
    function isNameLocked(bytes32 node) public view virtual returns (bool) {
        return name_locks[node] || isAllLocked(node);
    }

    /**
     * Locks the name for this ENS node.
     * @param node The node to lock.
     */
    function lockName(bytes32 node) public virtual authorised(node) {
        name_locks[node] = true;
        _setUnclearable(node);
        emit NameLocked(node);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(INameResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
