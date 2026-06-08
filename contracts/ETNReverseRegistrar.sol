// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ETNRegistry.sol";
import "./ETNPublicResolver.sol";

/**
 * @title ETNReverseRegistrar
 * @notice Allows any address to claim a reverse record so wallets can show
 *         "alice.etn" instead of "0xAbc…" in UIs.
 *
 * Reverse nodes live under the special TLD:
 *   <addr-hex-lowercase>.addr.reverse
 *
 * Compatible with ENS reverse resolution: tools that know ENS reverse lookup
 * will work as-is once pointed at this registrar and the public resolver.
 */
contract ETNReverseRegistrar {

    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────

    /// namehash("addr.reverse")
    bytes32 public constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a0022c3ff27df9e8a76d78dfcec09b2e21c7d84cfb6f2ba4;

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────

    ETNRegistry       public immutable registry;
    ETNPublicResolver public           defaultResolver;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event ReverseClaimed(address indexed addr, bytes32 indexed node);

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor(address _registry, address _resolver) {
        registry        = ETNRegistry(_registry);
        defaultResolver = ETNPublicResolver(_resolver);
    }

    // ─────────────────────────────────────────────
    //  Claim
    // ─────────────────────────────────────────────

    /**
     * @notice Claim a reverse record for msg.sender and set the forward name.
     * @param forwardName  The .etn name to associate (e.g. "alice.etn")
     */
    function setName(string calldata forwardName) external returns (bytes32) {
        bytes32 node = claimWithResolver(msg.sender, address(defaultResolver));
        defaultResolver.setName(node, forwardName);
        return node;
    }

    /**
     * @notice Claim the reverse node for `addr`, setting `resolver` as its resolver.
     *         Can only be called by `addr` itself.
     */
    function claimWithResolver(address addr, address resolver)
        public returns (bytes32 node)
    {
        require(
            addr == msg.sender,
            "ETNReverseRegistrar: only callable by address owner"
        );

        bytes32 labelHash = keccak256(bytes(_toHexString(addr)));
        node = keccak256(abi.encodePacked(ADDR_REVERSE_NODE, labelHash));

        registry.setSubnodeOwner(ADDR_REVERSE_NODE, labelHash, addr);
        if (resolver != address(0)) {
            registry.setResolver(node, resolver);
        }

        emit ReverseClaimed(addr, node);
    }

    /**
     * @notice Look up the reverse node for an address (read-only).
     */
    function node(address addr) public pure returns (bytes32) {
        bytes32 labelHash = keccak256(bytes(_toHexString(addr)));
        return keccak256(abi.encodePacked(ADDR_REVERSE_NODE, labelHash));
    }

    // ─────────────────────────────────────────────
    //  Internal — address to lowercase hex string
    // ─────────────────────────────────────────────

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory result   = new bytes(40);
        uint160 value = uint160(addr);
        for (uint256 i = 40; i > 0; i--) {
            result[i - 1] = alphabet[value & 0xf];
            value >>= 4;
        }
        return string(result);
    }
}