// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

struct Lookup {
    bytes dns; // dns-encoded name (safe to decode)
    uint256 offset; // byte offset into dns for basename
    bytes32 node; // namehash(dns)
    bytes32 basenode; // namehash(dns.slice(offset))
    address resolver; // resolver(basenode), null if invalid
    bool extended; // IExtendedResolver
    //address subregistry; // v2 support?
}

struct Response {
    uint256 bits; // ResponseBits
    bytes call; // record calldata
    bytes data; // answer (or error)
}

library ResponseBits {
    uint256 constant ERROR = 1 << 0; // resolution failed
    uint256 constant OFFCHAIN = 1 << 1; // reverted OffchainLookup
    uint256 constant BATCHED = 1 << 2; // used Batched Gateway
    uint256 constant RESOLVED = 1 << 3; // resolution finished (internal flag)
}

error LengthMismatch();

interface IForwardResolution {
    function registry() external view returns (address);
    function lookupName(
        bytes memory dns
    ) external view returns (Lookup memory lookup);
    function resolve(
        bytes memory dns,
        bytes[] memory calls,
        string[] memory batchedGateways
    ) external view returns (Lookup memory lookup, Response[] memory res);
}
