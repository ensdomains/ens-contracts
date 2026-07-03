// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HashHelper {
    function getHash(string memory label) external pure returns (bytes32) {
        return keccak256(bytes(label));
    }
    
    function getSubnode(bytes32 node, bytes32 label) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(node, label));
    }
}