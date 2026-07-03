// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ETNRegistry.sol";
import "./ETNPublicResolver.sol";

contract ETNReverseRegistrar {

    bytes32 public constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;

    ETNRegistry       public immutable registry;
    ETNPublicResolver public           defaultResolver;

    event ReverseClaimed(address indexed addr, bytes32 indexed node);

    constructor(address _registry, address _resolver) {
        registry        = ETNRegistry(_registry);
        defaultResolver = ETNPublicResolver(_resolver);
    }

    function setName(string calldata forwardName) external returns (bytes32) {
        return _claim(msg.sender, address(defaultResolver), forwardName);
    }

    function claimWithResolver(address addr, address resolver)
        external returns (bytes32)
    {
        return _claim(addr, resolver, "");
    }

    function _claim(
        address addr,
        address resolver,
        string memory forwardName
    ) internal returns (bytes32 _node) {
        require(
            addr == msg.sender,
            "ETNReverseRegistrar: only callable by address owner"
        );

        bytes32 labelHash = keccak256(bytes(_toHexString(addr)));
        _node = keccak256(abi.encodePacked(ADDR_REVERSE_NODE, labelHash));

        // Step 1: registrar creates the subnode, keeping ownership temporarily
        registry.setSubnodeOwner(ADDR_REVERSE_NODE, labelHash, address(this));

        if (resolver != address(0)) {
            // Step 2: registrar still owns `_node` — authorised to set resolver
            registry.setResolver(_node, resolver);

            // Step 3: while still owner, set the forward name if provided
            if (bytes(forwardName).length > 0) {
                ETNPublicResolver(resolver).setName(_node, forwardName);
            }
        }

        // Step 4: transfer ownership of the reverse node to the actual address
        registry.setOwner(_node, addr);

        emit ReverseClaimed(addr, _node);
    }

    function node(address addr) public pure returns (bytes32) {
        bytes32 labelHash = keccak256(bytes(_toHexString(addr)));
        return keccak256(abi.encodePacked(ADDR_REVERSE_NODE, labelHash));
    }

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