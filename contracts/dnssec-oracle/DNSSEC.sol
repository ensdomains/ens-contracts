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
    ) public view virtual returns (bytes memory rrs, uint32 inception);

    /// @notice Backwards-compatible return type for `verifyRRSetAt()`.
    /// @param input A list of signed RRSets.
    /// @param currentTime The Unix timestamp to validate the records at.
    /// @return rrs Data from the last set.
    /// @return inception Inception time of the last set.
    function verifyRRSet(
        RRSetWithSignature[] memory input,
        uint256 currentTime
    ) public view virtual returns (bytes memory rrs, uint32 inception);

    /// @notice Convenience for `verifyRRSetAt(input, block.timestamp)`.
    function verifyRRSetNow(
        RRSetWithSignature[] memory input
    ) public view virtual returns (RRUtils.SignedSet[] memory);

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
