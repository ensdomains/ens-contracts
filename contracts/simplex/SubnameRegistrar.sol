//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

import {ENS} from "../registry/ENS.sol";
import {ISubnameRegistrar} from "./ISubnameRegistrar.sol";

/// @notice Creates and indexes subnames so the dApp can enumerate them and
///         resolve hash->label without an indexer. Immutable and single-purpose:
///         the only registry write it performs is creating a subnode owned by
///         the caller, so the registry-operator approval it requires is safe to
///         grant. If it is ever replaced, the index is reconstructible from the
///         registry via submitSubname (no data migration).
///
///         Subnames are hard-wired to the 2LD owner: createSubname takes no
///         owner parameter and forces the subname owner to msg.sender (which
///         must own the parent), and submitSubname only indexes subnames whose
///         owner matches their parent's. Foreign-owned subnames created by a
///         direct registry call are never indexed here.
contract SubnameRegistrar is ISubnameRegistrar {
    /// @dev The ENS registry this contract creates subnodes in.
    ENS public immutable ens;

    /// @dev labelhash => plaintext label (write-once, shared across parents).
    mapping(bytes32 => string) public labelOf;
    /// @dev node => whether it has already been indexed (dedup).
    mapping(bytes32 => bool) public childIndexed;
    /// @dev parentNode => child labelhashes.
    mapping(bytes32 => bytes32[]) private _children;

    error NotParentOwner();
    error OwnerMismatch();
    error SubnameDoesNotExist();

    event SubnameCreated(
        bytes32 indexed parentNode,
        bytes32 indexed node,
        bytes32 labelhash,
        string label,
        address owner
    );
    event SubnameIndexed(
        bytes32 indexed parentNode,
        bytes32 indexed node,
        bytes32 labelhash,
        string label
    );

    constructor(ENS _ens) {
        ens = _ens;
    }

    /// @notice Create `label`.<parent> owned by the caller and index it, in one
    ///         transaction. The caller must own `parentNode` and must have
    ///         approved this contract as a registry operator
    ///         (`ens.setApprovalForAll(subnameRegistrar, true)`).
    /// @dev    WARNING — reclaim/seize semantics: the subname owner is forced to
    ///         the caller (the parent owner), so calling this for a label that
    ///         already exists under the parent REASSIGNS it to the parent owner,
    ///         even if a third party currently holds it. This is intentional
    ///         (subnames are parent-revocable in the wrapper-free design).
    /// @dev    Emits both SubnameCreated and (via _index) SubnameIndexed; an
    ///         indexer listening to both should treat them as one logical create.
    function createSubname(
        bytes32 parentNode,
        string calldata label
    ) external returns (bytes32 node) {
        if (ens.owner(parentNode) != msg.sender) revert NotParentOwner();
        bytes32 labelhash = keccak256(bytes(label));
        node = keccak256(abi.encodePacked(parentNode, labelhash));
        // Owner is forced to the caller (the parent owner); no owner parameter.
        ens.setSubnodeOwner(parentNode, labelhash, msg.sender);
        _index(parentNode, node, labelhash, label);
        emit SubnameCreated(parentNode, node, labelhash, label, msg.sender);
    }

    /// @notice Permissionless backfill: index an existing subname (eg one created
    ///         before this contract, or via a direct registry call). Only indexes
    ///         subnames whose owner matches their parent's.
    function submitSubname(
        bytes32 parentNode,
        string calldata label
    ) external {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelhash));
        if (!ens.recordExists(node)) revert SubnameDoesNotExist();
        if (ens.owner(node) != ens.owner(parentNode)) revert OwnerMismatch();
        _index(parentNode, node, labelhash, label);
    }

    function _index(
        bytes32 parentNode,
        bytes32 node,
        bytes32 labelhash,
        string calldata label
    ) internal {
        if (childIndexed[node]) return;
        childIndexed[node] = true;
        _children[parentNode].push(labelhash);
        if (bytes(labelOf[labelhash]).length == 0) labelOf[labelhash] = label;
        emit SubnameIndexed(parentNode, node, labelhash, label);
    }

    /// @notice Number of indexed children of `parentNode` (including any whose
    ///         registry record has since been cleared — filter on read).
    function childrenLength(
        bytes32 parentNode
    ) external view returns (uint256) {
        return _children[parentNode].length;
    }

    /// @notice Paginated children of `parentNode`. Returns the child labelhashes
    ///         and their plaintext labels.
    function getChildren(
        bytes32 parentNode,
        uint256 start,
        uint256 count
    ) external view returns (bytes32[] memory hashes, string[] memory labels) {
        bytes32[] storage all = _children[parentNode];
        uint256 len = all.length;
        if (start >= len) return (new bytes32[](0), new string[](0));
        uint256 end = start + count;
        if (end > len) end = len;
        uint256 n = end - start;
        hashes = new bytes32[](n);
        labels = new string[](n);
        for (uint256 i; i < n; i++) {
            bytes32 labelhash = all[start + i];
            hashes[i] = labelhash;
            labels[i] = labelOf[labelhash];
        }
    }
}
