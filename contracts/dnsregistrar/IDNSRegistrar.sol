//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../dnssec-oracle/DNSSEC.sol";

interface IDNSRegistrar {
    function proveAndClaim(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input
    ) external;

    function proveAndClaimWithResolver(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input,
        address resolver,
        address addr
    ) external;
}
