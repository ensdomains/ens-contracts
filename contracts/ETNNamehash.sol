// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ETNNamehash
 * @notice Pure library implementing the ENS namehash algorithm (EIP-137).
 *
 * namehash("") = 0x000...000
 * namehash("etn") = keccak256(namehash("") ++ keccak256("etn"))
 * namehash("alice.etn") = keccak256(namehash("etn") ++ keccak256("alice"))
 *
 * Pre-computed roots for convenience:
 *   ETN_NODE   = namehash("etn")
 */
library ETNNamehash {

    bytes32 internal constant ETN_NODE =
        0x69a3977d40595dbc343e3fa6ddbd26dbe31cc237836622384941b3c5148974cd;
        // keccak256(abi.encodePacked(bytes32(0), keccak256("etn")))

    /**
     * @notice Compute namehash for a single-label name under .etn
     *         e.g. label = keccak256("alice") → namehash("alice.etn")
     */
    function etnNode(bytes32 labelHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(ETN_NODE, labelHash));
    }

    /**
     * @notice Compute namehash for a two-label name under .etn
     *         e.g. project "defi", name "alice" → namehash("alice.defi.etn")
     */
    function projectNode(bytes32 projectLabelHash, bytes32 nameLabelHash)
        internal pure returns (bytes32)
    {
        bytes32 projectNodeHash = keccak256(abi.encodePacked(ETN_NODE, projectLabelHash));
        return keccak256(abi.encodePacked(projectNodeHash, nameLabelHash));
    }

    /**
     * @notice Generic namehash — split a dot-separated name off-chain and
     *         feed label hashes in reverse order (root last).
     */
    function namehash(bytes32[] memory labels) internal pure returns (bytes32 node) {
        node = bytes32(0);
        for (uint256 i = labels.length; i > 0; i--) {
            node = keccak256(abi.encodePacked(node, labels[i - 1]));
        }
    }
}