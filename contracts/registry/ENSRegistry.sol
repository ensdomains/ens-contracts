// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./ENS.sol";

/// The ENS registry contract.
contract ENSRegistry is ENS {
    struct Record {
        address owner;
        address resolver;
        uint64 ttl;
    }

    mapping(bytes32 => Record) records;
    mapping(address => mapping(address => bool)) operators;
    mapping(address => bool) public subnodeCreators;

    // Permits modifications only by the owner of the specified node.
    modifier authorised(bytes32 node) {
        address owner_ = records[node].owner;
        require(owner_ == msg.sender || operators[owner_][msg.sender]);
        _;
    }

    // Permits subnode creation only by the node owner AND only if that
    // address is on the subnodeCreators whitelist (e.g. BaseRegistrar,
    // ReverseRegistrar). Blocks arbitrary name owners from creating
    // subdomains under names they own.
    modifier authorisedSubnodeCreator(bytes32 node) {
        address owner_ = records[node].owner;
        require(
            (owner_ == msg.sender || operators[owner_][msg.sender]) &&
                subnodeCreators[msg.sender],
            "Subnode creation restricted"
        );
        _;
    }

    // Restricts admin functions to the owner of the root node (0x0).
    modifier onlyRootOwner() {
        require(records[0x0].owner == msg.sender, "Not root owner");
        _;
    }

    /// @dev Constructs a new ENS registry.
    constructor() {
        records[0x0].owner = msg.sender;
    }

    /// @dev Grants or revokes permission for an address to create subnodes.
    ///      Only callable by the owner of the root node.
    /// @param creator The address to update.
    /// @param allowed Whether the address may create subnodes.
    function setSubnodeCreator(
        address creator,
        bool allowed
    ) external onlyRootOwner {
        subnodeCreators[creator] = allowed;
    }

    /// @dev Sets the record for a node.
    /// @param node The node to update.
    /// @param owner_ The address of the new owner.
    /// @param resolver_ The address of the resolver.
    /// @param ttl_ The TTL in seconds.
    function setRecord(
        bytes32 node,
        address owner_,
        address resolver_,
        uint64 ttl_
    ) external virtual override {
        setOwner(node, owner_);
        _setResolverAndTTL(node, resolver_, ttl_);
    }

    /// @dev Sets the record for a subnode.
    /// @param node The parent node.
    /// @param label The hash of the label specifying the subnode.
    /// @param owner_ The address of the new owner.
    /// @param resolver_ The address of the resolver.
    /// @param ttl_ The TTL in seconds.
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner_,
        address resolver_,
        uint64 ttl_
    ) external virtual override {
        bytes32 subnode = setSubnodeOwner(node, label, owner_);
        _setResolverAndTTL(subnode, resolver_, ttl_);
    }

    /// @dev Transfers ownership of a node to a new address. May only be called by the current owner of the node.
    /// @param node The node to transfer ownership of.
    /// @param owner_ The address of the new owner.
    function setOwner(
        bytes32 node,
        address owner_
    ) public virtual override authorised(node) {
        _setOwner(node, owner_);
        emit Transfer(node, owner_);
    }

    /// @dev Transfers ownership of a subnode keccak256(node, label) to a new address. May only be called by the owner of the parent node, and only if that owner is a whitelisted subnode creator.
    /// @param node The parent node.
    /// @param label The hash of the label specifying the subnode.
    /// @param owner_ The address of the new owner.
    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address owner_
    ) public virtual override authorisedSubnodeCreator(node) returns (bytes32) {
        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        _setOwner(subnode, owner_);
        emit NewOwner(node, label, owner_);
        return subnode;
    }

    /// @dev Sets the resolver address for the specified node.
    /// @param node The node to update.
    /// @param resolver_ The address of the resolver.
    function setResolver(
        bytes32 node,
        address resolver_
    ) public virtual override authorised(node) {
        emit NewResolver(node, resolver_);
        records[node].resolver = resolver_;
    }

    /// @dev Sets the TTL for the specified node.
    /// @param node The node to update.
    /// @param ttl_ The TTL in seconds.
    function setTTL(
        bytes32 node,
        uint64 ttl_
    ) public virtual override authorised(node) {
        emit NewTTL(node, ttl_);
        records[node].ttl = ttl_;
    }

    /// @dev Enable or disable approval for a third party ("operator") to manage
    ///      all of `msg.sender`'s ENS records. Emits the ApprovalForAll event.
    /// @param operator Address to add to the set of authorized operators.
    /// @param approved True if the operator is approved, false to revoke approval.
    function setApprovalForAll(
        address operator,
        bool approved
    ) external virtual override {
        operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @dev Returns the address that owns the specified node.
    /// @param node The specified node.
    /// @return address of the owner.
    function owner(
        bytes32 node
    ) public view virtual override returns (address) {
        address addr = records[node].owner;
        if (addr == address(this)) {
            return address(0x0);
        }

        return addr;
    }

    /// @dev Returns the address of the resolver for the specified node.
    /// @param node The specified node.
    /// @return address of the resolver.
    function resolver(
        bytes32 node
    ) public view virtual override returns (address) {
        return records[node].resolver;
    }

    /// @dev Returns the TTL of a node, and any records associated with it.
    /// @param node The specified node.
    /// @return ttl of the node.
    function ttl(bytes32 node) public view virtual override returns (uint64) {
        return records[node].ttl;
    }

    /// @dev Returns whether a record has been imported to the registry.
    /// @param node The specified node.
    /// @return Bool if record exists
    function recordExists(
        bytes32 node
    ) public view virtual override returns (bool) {
        return records[node].owner != address(0x0);
    }

    /// @dev Query if an address is an authorized operator for another address.
    /// @param owner_ The address that owns the records.
    /// @param operator The address that acts on behalf of the owner.
    /// @return True if `operator` is an approved operator for `owner_`, false otherwise.
    function isApprovedForAll(
        address owner_,
        address operator
    ) external view virtual override returns (bool) {
        return operators[owner_][operator];
    }

    function _setOwner(bytes32 node, address owner_) internal virtual {
        records[node].owner = owner_;
    }

    function _setResolverAndTTL(
        bytes32 node,
        address resolver_,
        uint64 ttl_
    ) internal {
        if (resolver_ != records[node].resolver) {
            records[node].resolver = resolver_;
            emit NewResolver(node, resolver_);
        }

        if (ttl_ != records[node].ttl) {
            records[node].ttl = ttl_;
            emit NewTTL(node, ttl_);
        }
    }
}