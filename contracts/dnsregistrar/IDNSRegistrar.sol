//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../dnssec-oracle/DNSSEC.sol";

interface IDNSRegistrar {
    function proveAndClaim(DNSSEC.RRSetWithSignature[] memory input) external;
}
