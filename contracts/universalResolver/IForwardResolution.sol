// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @dev Resolver Lookup
/// node of resolver = namehash(name.slice(offset))
struct Lookup {
    bytes name; // dns-encoded name (safe to decode)
    uint256 offset; // byte offset into name for basename
    bytes32 node; // namehash(name)
    address resolver; // resolver(basenode), null if invalid
    address registry; // v1 => registry, v2 => subregistry
    uint256 bits; // LookupBits
}

library LookupBits {
    uint256 constant OK = 1 << 0; // usable
    uint256 constant EXTENDED = 1 << 1; // IExtendedResolver
}

/// @dev Resolver Response
struct Response {
    uint256 bits; // ResponseBits
    bytes call; // original calldata
    bytes data; // response (or error, if ERROR bit set)
}

library ResponseBits {
    uint256 constant ERROR = 1 << 0; // resolution failed
    uint256 constant OFFCHAIN = 1 << 1; // reverted OffchainLookup
    uint256 constant BATCHED = 1 << 2; // used Batched Gateway
    uint256 constant RESOLVED = 1 << 3; // resolution finished (internal flag)
}

error LengthMismatch();

interface IForwardResolution {
    function lookupName(
        bytes memory name
    ) external view returns (Lookup memory lookup);
    function resolve(
        bytes memory name,
        bytes[] memory calls,
        string[] memory batchGateways
    ) external view returns (Lookup memory lookup, Response[] memory res);
}
