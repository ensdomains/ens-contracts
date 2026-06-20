//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

import {ENS} from "../registry/ENS.sol";
import {ISubnameRegistrar} from "./ISubnameRegistrar.sol";

/// @notice Creates, owns, and resolves subnames so they are *soulbound to the
///         2LD NFT*. A subname has no independent owner: in the registry it is
///         owned by this contract, and its effective owner is whoever holds the
///         parent 2LD token. Transferring the 2LD NFT moves every subname with
///         it instantly — no reclaim, no re-seize, no stale ownership.
///
///         It plugs into the verbatim PublicResolver's wrapper hook: deploy the
///         resolver with `nameWrapper = subnameRegistrar`, and the resolver
///         authorises a subname's records against `ownerOf(node)` below (the
///         live 2LD holder). The 2LD node itself is owned directly by the NFT
///         holder (BaseRegistrar auto-reclaim keeps it synced), so the 2LD is
///         NOT wrapped — only subname authorisation routes through here.
///
///         Re-registration of a 2LD bumps a per-2LD `generation`
///         (`onReregister`, called by BaseRegistrar), which invalidates the
///         previous owner's subnames; their leftover storage is reclaimed by the
///         permissionless `purge`. Depth is supported (subnames of subnames):
///         `ownerOf` walks up the parent chain to the 2LD.
contract SubnameRegistrar is ISubnameRegistrar {
    /// @dev The ENS registry.
    ENS public immutable ens;
    /// @dev BaseRegistrar; only it may bump generations.
    address public immutable baseRegistrar;
    /// @dev Resolver set on every created subname. One-time wiring (set after
    ///      the resolver is deployed, since the resolver's nameWrapper points
    ///      here), then immutable.
    address public resolver;
    address private immutable _deployer;

    /// @dev subname node => parent node (for the ownerOf walk-up).
    mapping(bytes32 => bytes32) public parentOf;
    /// @dev subname node => 2LD generation it was created under.
    mapping(bytes32 => uint256) public generationAt;
    /// @dev 2LD node => current generation (bumped on re-registration).
    mapping(bytes32 => uint256) public generation;

    /// @dev labelhash => plaintext label (write-once, shared across parents).
    mapping(bytes32 => string) public labelOf;
    /// @dev node => indexed (dedup).
    mapping(bytes32 => bool) public childIndexed;
    /// @dev parentNode => child labelhashes.
    mapping(bytes32 => bytes32[]) private _children;

    /// @dev Max subname label byte-length (the DNS octet limit), matching the
    ///      2LD cap. Constant — the contract has no general owner.
    uint256 public constant MAX_LABEL_LENGTH = 63;

    error NotParentOwner();
    error LabelTooLong(uint256 length, uint256 max);
    error NotBaseRegistrar();
    error AlreadyInitialised();

    event SubnameCreated(
        bytes32 indexed parentNode,
        bytes32 indexed node,
        bytes32 labelhash,
        string label
    );
    event SubnameDeleted(bytes32 indexed parentNode, bytes32 indexed node);
    event GenerationBumped(bytes32 indexed node, uint256 generation);

    constructor(ENS _ens, address _baseRegistrar) {
        ens = _ens;
        baseRegistrar = _baseRegistrar;
        _deployer = msg.sender;
    }

    /// @notice One-time wiring: set the resolver applied to created subnames.
    function setResolver(address _resolver) external {
        if (msg.sender != _deployer || resolver != address(0))
            revert AlreadyInitialised();
        resolver = _resolver;
    }

    // ---------- effective ownership (soulbound to the 2LD NFT) ----------

    /// @notice The effective owner of subname `node`: the holder of the parent
    ///         2LD NFT, found by walking up the parent chain to the 2LD node
    ///         (whose registry owner tracks the NFT via auto-reclaim). Returns
    ///         address(0) for an untracked node or a generation-dead subname.
    ///         This is the function the PublicResolver's wrapper hook calls to
    ///         authorise subname records.
    function ownerOf(uint256 node) public view returns (address) {
        bytes32 n = bytes32(node);
        if (parentOf[n] == bytes32(0)) return address(0);
        bytes32 root = _rootNode(n);
        if (generationAt[n] != generation[root]) return address(0); // dead
        return ens.owner(root);
    }

    /// @dev The 2LD node at the root of `node`'s parent chain.
    function _rootNode(bytes32 node) internal view returns (bytes32) {
        bytes32 p = node;
        while (parentOf[p] != bytes32(0)) {
            p = parentOf[p];
        }
        return p;
    }

    /// @dev Who may manage subnames under `node`: for a 2LD, its registry owner
    ///      (= NFT holder via auto-reclaim); for a subname (owned by this
    ///      contract), its effective NFT holder.
    function _controller(bytes32 node) internal view returns (address) {
        if (ens.owner(node) == address(this)) return ownerOf(uint256(node));
        return ens.owner(node);
    }

    // ---------- create / delete ----------

    /// @notice Create `label`.<parent>, owned by this contract and soulbound to
    ///         the parent's 2LD NFT. The caller must be the effective owner of
    ///         `parentNode` and, for a 2LD parent, have approved this contract as
    ///         a registry operator (`ens.setApprovalForAll(subnameRegistrar,
    ///         true)`). Re-running it on a generation-dead subname revives it.
    function createSubname(
        bytes32 parentNode,
        string calldata label
    ) external returns (bytes32 node) {
        if (bytes(label).length > MAX_LABEL_LENGTH)
            revert LabelTooLong(bytes(label).length, MAX_LABEL_LENGTH);
        if (_controller(parentNode) != msg.sender) revert NotParentOwner();
        bytes32 labelhash = keccak256(bytes(label));
        node = keccak256(abi.encodePacked(parentNode, labelhash));

        // Owned by this contract, with the resolver set so records resolve; the
        // PublicResolver then authorises those records against ownerOf(node).
        ens.setSubnodeRecord(parentNode, labelhash, address(this), resolver, 0);

        parentOf[node] = parentNode;
        generationAt[node] = generation[_rootNode(parentNode)];
        if (!childIndexed[node]) {
            childIndexed[node] = true;
            _children[parentNode].push(labelhash);
        }
        if (bytes(labelOf[labelhash]).length == 0) labelOf[labelhash] = label;
        emit SubnameCreated(parentNode, node, labelhash, label);
    }

    /// @notice Delete a subname (clears its record + index). Caller must be the
    ///         effective owner of the parent.
    function deleteSubname(bytes32 parentNode, string calldata label) external {
        if (_controller(parentNode) != msg.sender) revert NotParentOwner();
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelhash));
        _clear(parentNode, node, labelhash);
    }

    /// @notice Permissionless garbage collection: delete generation-dead subnames
    ///         (left over after the parent 2LD was re-registered), reclaiming
    ///         their registry + index storage. Caller picks the batch.
    function purge(
        bytes32 parentNode,
        bytes32[] calldata labelhashes
    ) external {
        uint256 g = generation[_rootNode(parentNode)];
        for (uint256 i; i < labelhashes.length; i++) {
            bytes32 node = keccak256(
                abi.encodePacked(parentNode, labelhashes[i])
            );
            if (parentOf[node] == bytes32(0)) continue; // untracked
            if (generationAt[node] == g) continue; // still live
            _clear(parentNode, node, labelhashes[i]);
        }
    }

    /// @dev Clear a subname this contract owns: zero its registry record (owner
    ///      + resolver) and drop its index entry. Authorised because this
    ///      contract owns the node.
    function _clear(
        bytes32 parentNode,
        bytes32 node,
        bytes32 labelhash
    ) internal {
        if (ens.owner(node) == address(this)) {
            ens.setResolver(node, address(0));
            ens.setOwner(node, address(0));
        }
        delete parentOf[node];
        delete generationAt[node];
        if (childIndexed[node]) {
            childIndexed[node] = false;
            _removeChild(parentNode, labelhash);
        }
        emit SubnameDeleted(parentNode, node);
    }

    function _removeChild(bytes32 parentNode, bytes32 labelhash) internal {
        bytes32[] storage arr = _children[parentNode];
        uint256 len = arr.length;
        for (uint256 i; i < len; i++) {
            if (arr[i] == labelhash) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
        }
    }

    // ---------- generation / GC hook ----------

    /// @notice Called by BaseRegistrar when 2LD `node` is re-registered:
    ///         invalidates the previous owner's subnames under it (O(1)). Their
    ///         storage is then reclaimable via `purge`.
    function onReregister(bytes32 node) external {
        if (msg.sender != baseRegistrar) revert NotBaseRegistrar();
        emit GenerationBumped(node, ++generation[node]);
    }

    // ---------- enumeration ----------

    /// @notice Number of indexed children of `parentNode` (including dead ones
    ///         not yet purged — filter on read via `ownerOf`).
    function childrenLength(
        bytes32 parentNode
    ) external view returns (uint256) {
        return _children[parentNode].length;
    }

    /// @notice Paginated children of `parentNode`: child labelhashes + plaintext
    ///         labels. A child is live iff `ownerOf(node) != address(0)`.
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
