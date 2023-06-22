// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../ResolverBase.sol";
import "./IContentHashResolver.sol";

error ContenthashIsLocked();

abstract contract ContentHashResolver is IContentHashResolver, ResolverBase {
    mapping(uint64 => mapping(bytes32 => bytes)) versionable_hashes;
    mapping(bytes32 => bool) contenthash_locks;

    event ContenthashLocked(bytes32 indexed node);

    /**
     * Sets the contenthash associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     * @param hash The contenthash to set
     */
    function setContenthash(
        bytes32 node,
        bytes calldata hash
    ) external virtual authorised(node) {
        if (isContenthashLocked(node)) {
            revert ContenthashIsLocked();
        }
        versionable_hashes[recordVersions[node]][node] = hash;
        emit ContenthashChanged(node, hash);
    }

    /**
     * Returns the contenthash associated with an ENS node.
     * @param node The ENS node to query.
     * @return The associated contenthash.
     */
    function contenthash(
        bytes32 node
    ) external view virtual override returns (bytes memory) {
        return versionable_hashes[recordVersions[node]][node];
    }

    /**
     * Returns true if the contenthash has been locked for this ENS node.
     * @param node The ENS node to check.
     */
    function isContenthashLocked(
        bytes32 node
    ) public view virtual returns (bool) {
        return contenthash_locks[node] || isAllLocked(node);
    }

    /**
     * Locks the contenthash for this ENS node.
     * @param node The node to lock.
     */
    function lockContenthash(bytes32 node) public virtual authorised(node) {
        contenthash_locks[node] = true;
        _setUnclearable(node);
        emit ContenthashLocked(node);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IContentHashResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
