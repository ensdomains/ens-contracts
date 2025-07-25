// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DNSSEC} from "./DNSSEC.sol";

/// @notice Interface for the offchain DNSSEC oracle gateway.
/// @dev Interface selector: `0x31b137b9`
interface IDNSGateway {
    /// @param name The DNS-encoded name.
    /// @param qtype The DNS record query type.
    /// @return The list of verifiable DNS resource records.
    function resolve(
        bytes memory name,
        uint16 qtype
    ) external returns (DNSSEC.RRSetWithSignature[] memory);
}
