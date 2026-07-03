// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ETNRegistry
 * @notice Central registry for all .etn and .project.etn names.
 *         Stores owner, resolver, and TTL for every registered node.
 *         Architecture mirrors ENS — a pure registry with no pricing logic.
 */
contract ETNRegistry {

    // ─────────────────────────────────────────────
    //  Structs & state
    // ─────────────────────────────────────────────

    struct Record {
        address owner;
        address resolver;
        uint64  ttl;
    }

    /// node (namehash) => Record
    mapping(bytes32 => Record) internal _records;

    /// node => (operator => approved)
    mapping(bytes32 => mapping(address => bool)) internal _operators;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event NewOwner   (bytes32 indexed node, bytes32 indexed label, address owner);
    event Transfer   (bytes32 indexed node, address owner);
    event NewResolver(bytes32 indexed node, address resolver);
    event NewTTL     (bytes32 indexed node, uint64 ttl);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

modifier authorised(bytes32 node) {
    address _owner = _records[node].owner;
    require(
        _owner == msg.sender || _operators[node][msg.sender],
        "ETNRegistry: not authorised"
    );
    _;
}

    // ─────────────────────────────────────────────
    //  Constructor — bootstrap root node
    // ─────────────────────────────────────────────

    constructor() {
        _records[0x0].owner = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  Write functions
    // ─────────────────────────────────────────────

    /**
     * @notice Set a subnode owner. Called by the Registrar when minting a name.
     * @param node   Parent node  (e.g. namehash("etn"))
     * @param label  keccak256 of the label being registered (e.g. keccak256("alice"))
     * @param owner_ The new owner address
     */
    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address owner_
    ) external authorised(node) returns (bytes32 subnode) {
        subnode = keccak256(abi.encodePacked(node, label));
        _setOwner(subnode, owner_);
        emit NewOwner(node, label, owner_);
    }

    /**
     * @notice Set the full record for a node in one call.
     */
    function setRecord(
        bytes32 node,
        address owner_,
        address resolver_,
        uint64  ttl_
    ) external authorised(node) {
        _setOwner(node, owner_);
        _records[node].resolver = resolver_;
        _records[node].ttl      = ttl_;
        emit NewResolver(node, resolver_);
        emit NewTTL(node, ttl_);
    }

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner_,
        address resolver_,
        uint64  ttl_
    ) external authorised(node) returns (bytes32 subnode) {
        subnode = keccak256(abi.encodePacked(node, label));
        _setOwner(subnode, owner_);
        _records[subnode].resolver = resolver_;
        _records[subnode].ttl      = ttl_;
        emit NewOwner(node, label, owner_);
        emit NewResolver(subnode, resolver_);
        emit NewTTL(subnode, ttl_);
    }

    function setOwner(bytes32 node, address owner_) external authorised(node) {
        _setOwner(node, owner_);
        emit Transfer(node, owner_);
    }

    function setResolver(bytes32 node, address resolver_) external authorised(node) {
        _records[node].resolver = resolver_;
        emit NewResolver(node, resolver_);
    }

    function setTTL(bytes32 node, uint64 ttl_) external authorised(node) {
        _records[node].ttl = ttl_;
        emit NewTTL(node, ttl_);
    }

    function setApprovalForAll(bytes32 node, address operator, bool approved) external {
        require(msg.sender == _records[node].owner, "ETNRegistry: not owner");
        _operators[node][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ─────────────────────────────────────────────
    //  Read functions
    // ─────────────────────────────────────────────

    function owner   (bytes32 node) external view returns (address) { return _records[node].owner; }
    function resolver(bytes32 node) external view returns (address) { return _records[node].resolver; }
    function ttl     (bytes32 node) external view returns (uint64)  { return _records[node].ttl; }

    function recordExists(bytes32 node) external view returns (bool) {
        return _records[node].owner != address(0);
    }

    function isApprovedForAll(bytes32 node, address operator) external view returns (bool) {
        return _operators[node][operator];
    }

    // ─────────────────────────────────────────────
    //  Internal
    // ─────────────────────────────────────────────

    function _setOwner(bytes32 node, address owner_) internal {
        _records[node].owner = owner_;
    }
}