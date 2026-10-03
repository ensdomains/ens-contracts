// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {RRUtils} from "./RRUtils.sol";

abstract contract DNSSEC {
    bytes public anchors;

    struct RRSetWithSignature {
        bytes rrset;
        bytes sig;
    }

    event AnchorsUpdated(bytes);
    event AlgorithmUpdated(uint8 id, address addr);
    event DigestUpdated(uint8 id, address addr);

    function verifyRRSet(
        RRSetWithSignature[] memory input
    ) external view virtual returns (RRUtils.SignedSet[] memory);

    function verifyRRSet(
        RRSetWithSignature[] memory input,
        uint256 currentTime
    ) public view virtual returns (RRUtils.SignedSet[] memory);
}
