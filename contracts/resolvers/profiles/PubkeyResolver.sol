// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../ResolverBase.sol";
import "./IPubkeyResolver.sol";

error PubkeyIsLocked();

abstract contract PubkeyResolver is IPubkeyResolver, ResolverBase {
    struct PublicKey {
        bytes32 x;
        bytes32 y;
    }

    mapping(uint64 => mapping(bytes32 => PublicKey)) versionable_pubkeys;
    mapping(bytes32 => bool) pubkey_locks;

    event PubkeyLocked(bytes32 indexed node);

    /**
     * Sets the SECP256k1 public key associated with an ENS node.
     * @param node The ENS node to query
     * @param x the X coordinate of the curve point for the public key.
     * @param y the Y coordinate of the curve point for the public key.
     */
    function setPubkey(
        bytes32 node,
        bytes32 x,
        bytes32 y
    ) external virtual authorised(node) {
        if (isPubkeyLocked(node)) {
            revert PubkeyIsLocked();
        }
        versionable_pubkeys[recordVersions[node]][node] = PublicKey(x, y);
        emit PubkeyChanged(node, x, y);
    }

    /**
     * Returns the SECP256k1 public key associated with an ENS node.
     * Defined in EIP 619.
     * @param node The ENS node to query
     * @return x The X coordinate of the curve point for the public key.
     * @return y The Y coordinate of the curve point for the public key.
     */
    function pubkey(
        bytes32 node
    ) external view virtual override returns (bytes32 x, bytes32 y) {
        uint64 currentRecordVersion = recordVersions[node];
        return (
            versionable_pubkeys[currentRecordVersion][node].x,
            versionable_pubkeys[currentRecordVersion][node].y
        );
    }

    /**
     * Returns true if the public key has been locked for this ENS node.
     * @param node The ENS node to check.
     */
    function isPubkeyLocked(bytes32 node) public view virtual returns (bool) {
        return pubkey_locks[node] || isAllLocked(node);
    }

    /**
     * Locks the public key for this ENS node.
     * @param node The node to lock.
     */
    function lockPubkey(bytes32 node) public virtual authorised(node) {
        pubkey_locks[node] = true;
        _setUnclearable(node);
        emit PubkeyLocked(node);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IPubkeyResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
