// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ETNRegistry.sol";

/**
 * @title ETNPublicResolver
 * @notice Stores address, text, and content-hash records for .etn names.
 *         Mirrors the ENS PublicResolver interface so existing tooling works.
 *
 * Supported record types:
 *   addr(node)              — EVM address (chain 52014 by default)
 *   addr(node, coinType)    — multi-coin addresses (SLIP-0044)
 *   text(node, key)         — arbitrary key/value (avatar, url, email, …)
 *   contenthash(node)       — IPFS / Arweave / Swarm content hash
 *   name(node)              — canonical name (reverse records)
 */
contract ETNPublicResolver {

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────

    ETNRegistry public immutable registry;

    /// node → EVM address
    mapping(bytes32 => address) private _addresses;

    /// node → coinType → bytes address
    mapping(bytes32 => mapping(uint256 => bytes)) private _coinAddresses;

    /// node → key → value
    mapping(bytes32 => mapping(string => string)) private _texts;

    /// node → contenthash bytes
    mapping(bytes32 => bytes) private _contentHashes;

    /// node → canonical name
    mapping(bytes32 => string) private _names;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event AddrChanged       (bytes32 indexed node, address addr);
    event AddressChanged    (bytes32 indexed node, uint256 coinType, bytes newAddress);
    event TextChanged       (bytes32 indexed node, string indexed key, string value);
    event ContenthashChanged(bytes32 indexed node, bytes hash);
    event NameChanged       (bytes32 indexed node, string name);

    // ─────────────────────────────────────────────
    //  Modifier
    // ─────────────────────────────────────────────

    modifier authorised(bytes32 node) {
        address nodeOwner = registry.owner(node);
        require(
            nodeOwner == msg.sender ||
            registry.isApprovedForAll(node, msg.sender),
            "ETNResolver: not authorised"
        );
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor(address _registry) {
        registry = ETNRegistry(_registry);
    }

    // ─────────────────────────────────────────────
    //  Address records
    // ─────────────────────────────────────────────

function setAddr(bytes32 node, address _addr) external authorised(node) {
    _addresses[node] = _addr;
    emit AddrChanged(node, _addr);
}

    function addr(bytes32 node) external view returns (address) {
        return _addresses[node];
    }

    function setAddr(bytes32 node, uint256 coinType, bytes calldata a)
        external authorised(node)
    {
        _coinAddresses[node][coinType] = a;
        emit AddressChanged(node, coinType, a);
    }

    function addr(bytes32 node, uint256 coinType)
        external view returns (bytes memory)
    {
        return _coinAddresses[node][coinType];
    }

    // ─────────────────────────────────────────────
    //  Text records
    // ─────────────────────────────────────────────

    function setText(bytes32 node, string calldata key, string calldata value)
        external authorised(node)
    {
        _texts[node][key] = value;
        emit TextChanged(node, key, value);
    }

    function text(bytes32 node, string calldata key)
        external view returns (string memory)
    {
        return _texts[node][key];
    }

    // ─────────────────────────────────────────────
    //  Content hash
    // ─────────────────────────────────────────────

    function setContenthash(bytes32 node, bytes calldata hash)
        external authorised(node)
    {
        _contentHashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    function contenthash(bytes32 node) external view returns (bytes memory) {
        return _contentHashes[node];
    }

    // ─────────────────────────────────────────────
    //  Canonical name (reverse resolution)
    // ─────────────────────────────────────────────

    function setName(bytes32 node, string calldata _name)
        external authorised(node)
    {
        _names[node] = _name;
        emit NameChanged(node, _name);
    }

    function name(bytes32 node) external view returns (string memory) {
        return _names[node];
    }

    // ─────────────────────────────────────────────
    //  ERC-165 supportsInterface
    // ─────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return
            interfaceID == 0x01ffc9a7 || // ERC-165
            interfaceID == 0x3b3b57de || // addr(bytes32)
            interfaceID == 0xf1cb7e06 || // addr(bytes32,uint256)
            interfaceID == 0x59d1d43c || // text
            interfaceID == 0xbc1c58d1 || // contenthash
            interfaceID == 0x691f3431;   // name
    }
}