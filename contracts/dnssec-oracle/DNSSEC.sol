// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {RRUtils} from "./RRUtils.sol";

abstract contract DNSSEC {
    struct RRSetWithSignature {
        bytes rrset;
        bytes sig;
    }

    event AnchorsUpdated(bytes);
    event AlgorithmUpdated(uint8 id, address addr);
    event DigestUpdated(uint8 id, address addr);

    bytes public anchors;

    /// @notice Backwards-compatible convenience for `verifyRRSet(input, block.timestamp)`.
    function verifyRRSet(
        RRSetWithSignature[] memory input
    ) external view returns (bytes memory rrs, uint32 inception) {
        return verifyRRSet(input, uint32(block.timestamp));
    }

    /// @notice Backwards-compatible return type for `verifyRRSetAt()`.
    function verifyRRSet(
        RRSetWithSignature[] memory input,
        uint256 currentTime
    ) public view returns (bytes memory rrs, uint32 inception) {
        if (input.length == 0) {
            return (anchors, 0); // instead of revert InvalidRRSet
        }
        RRUtils.SignedSet[] memory sss = verifyRRSetAt(input, currentTime);
        RRUtils.SignedSet memory ss = sss[sss.length - 1];
        return (ss.data, ss.inception);
    }

    /// @notice Convenience for `verifyRRSetAt(input, block.timestamp)`.
    function verifyRRSetNow(
        RRSetWithSignature[] memory input
    ) public view returns (RRUtils.SignedSet[] memory) {
        return verifyRRSetAt(input, uint32(block.timestamp));
    }

    /// @notice Takes a chain of signed DNS records, verifies them, and returns the array of signed sets.
    ///         Reverts if the records do not form an unbroken chain of trust to the DNSSEC anchor records.
    /// @param input A list of signed RRSets.
    /// @param currentTime The Unix timestamp to validate the records at.
    /// @return Array of signed sets.
    function verifyRRSetAt(
        RRSetWithSignature[] memory input,
        uint256 currentTime
    ) public view virtual returns (RRUtils.SignedSet[] memory);
}
