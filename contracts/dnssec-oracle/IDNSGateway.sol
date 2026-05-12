// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DNSSEC} from "./DNSSEC.sol";

/// @notice Interface for the offchain DNSSEC oracle gateway.
///         https://docs.ens.domains/ensip/17#dnssec-gateway-api
/// @dev Interface selector: `0x31b137b9`
interface IDNSGateway {
    /// @dev Fetch verifiable DNSSEC resource records of a specific type for a name.
    /// @param name The DNS-encoded name.
    /// @param qtype The DNS record query type according to RFC-1034.
    /// @return The list of verifiable DNS resource records according to RFC-4035.
    function resolve(
        bytes memory name,
        uint16 qtype
    ) external returns (DNSSEC.RRSetWithSignature[] memory);
}
