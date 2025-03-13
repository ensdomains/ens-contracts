// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165, ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {ENS} from "../registry/ENS.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {IResolveMulticall} from "../resolvers/IResolveMulticall.sol";
import {BytesUtilsEncrypted} from "../utils/BytesUtilsEncrypted.sol";
import {IBatchedGateway, BatchedGatewayQuery} from "../utils/IBatchedGateway.sol";
import {IForwardResolution, Lookup, LookupBits, Response, ResponseBits, LengthMismatch} from "./IForwardResolution.sol";
import {CCIPReader, OffchainLookup, OffchainLookupTuple, EIP3668} from "../ccipRead/CCIPReader.sol";

contract ForwardResolution is IForwardResolution, IERC165, CCIPReader, Ownable {
    address public immutable registry;
    string[] public batchedGateways;

    constructor(address ens, string[] memory gateways) {
        registry = ens;
        batchedGateways = gateways;
    }

    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            type(IERC165).interfaceId == x ||
            type(IForwardResolution).interfaceId == x;
    }

    function setBatchedGateways(string[] memory gateways) external onlyOwner {
        batchedGateways = gateways;
    }

    function lookupName(
        bytes memory name
    ) public view returns (Lookup memory lookup) {
        // https://docs.ens.domains/ensip/10
        uint256 offset;
        address resolver;
        bytes32 node = BytesUtilsEncrypted.namehash(name, 0);
        lookup.name = name;
        lookup.node = node;
        lookup.registry = registry; // always the same
        while (true) {
            resolver = ENS(registry).resolver(node);
            if (resolver != address(0)) break; // found a resolver
            uint256 size = uint8(name[offset]);
            if (size == 0) return lookup; // no match
            offset += 1 + size;
            node = BytesUtilsEncrypted.namehash(name, offset);
        }
        if (
            ERC165Checker.supportsInterface(
                resolver,
                type(IExtendedResolver).interfaceId
            )
        ) {
            lookup.bits |= LookupBits.EXTENDED;
        } else if (offset != 0) {
            return lookup; // non-extended resolver requires exact match
        }
        lookup.resolver = resolver;
        if (resolver.code.length == 0) {
            return lookup; // eoa cannot be resolver
        }
        lookup.offset = offset; // offset into name
        lookup.bits |= LookupBits.OK; // usable
    }

    function resolve(
        bytes memory name,
        bytes[] memory calls,
        string[] memory gateways
    ) external view returns (Lookup memory lookup, Response[] memory res) {
        lookup = lookupName(name);
        if (lookup.bits == 0) return (lookup, res);
        res = new Response[](calls.length); // create result storage
        if (gateways.length == 0) gateways = batchedGateways; // use default
        bytes[] memory offchainCalls = new bytes[](calls.length);
        uint256 offchain; // count how many offchain
        for (uint256 i; i < res.length; i++) {
            bytes memory call = calls[i];
            (, bool ok, bytes memory v) = _callResolver(lookup, call);
            Response memory r = res[i];
            r.call = call; // remember calldata (post-inject, pre-resolve)
            r.data = v;
            if (!ok && bytes4(v) == OffchainLookup.selector) {
                r.bits |= ResponseBits.OFFCHAIN;
                offchainCalls[offchain++] = call;
            } else {
                if (!ok) r.bits |= ResponseBits.ERROR;
                r.bits |= ResponseBits.RESOLVED;
            }
        }
        if (offchain >= 1) {
            assembly {
                mstore(offchainCalls, offchain)
            }
            (bytes memory call, bool ok, bytes memory v) = _callResolver(
                lookup,
                abi.encodeCall(IResolveMulticall.multicall, (offchainCalls))
            );
            if (!ok && bytes4(v) == OffchainLookup.selector) {
                // assumes resolvers that revert for resolve(multicall) support wrapping
                // ********************************************************************************
                // NOTE: this is a temporary detection technique for resolvers that always revert
                // https://github.com/namestonehq/TheOffchainResolver.sol/blob/main/src/TOR.sol#L55
                (, ok, v) = _callResolver(lookup, hex"FFFFFF00");
                if (ok || bytes4(v) != OffchainLookup.selector) {
                    // must succeed OR not revert OffchainLookup()
                    // ********************************************************************************
                    ccipRead(
                        lookup.resolver,
                        call,
                        this.resolveMulticallCallback.selector,
                        abi.encode(lookup, res)
                    );
                }
            }
        }
        _revertBatchedGateway(lookup, res, gateways);
    }

    function _callResolver(
        Lookup memory lookup,
        bytes memory call0
    ) internal view returns (bytes memory call, bool ok, bytes memory v) {
        call = call0;
        if (_isExtendedResolver(lookup)) {
            call = abi.encodeCall(
                IExtendedResolver.resolve,
                (lookup.name, call)
            ); // wrap
        }
        (ok, v) = lookup.resolver.staticcall(call); // call it
        if (ok && _isExtendedResolver(lookup)) v = abi.decode(v, (bytes)); // unwrap
    }

    function _revertBatchedGateway(
        Lookup memory lookup,
        Response[] memory res,
        string[] memory gateways
    ) internal view {
        BatchedGatewayQuery[] memory queries = new BatchedGatewayQuery[](
            res.length
        );
        uint256 unresolved;
        for (uint256 i; i < res.length; i++) {
            Response memory r = res[i];
            if ((r.bits & ResponseBits.RESOLVED) == 0) {
                r.bits |= ResponseBits.BATCHED;
                OffchainLookupTuple memory x = EIP3668.decode(r.data);
                queries[unresolved++] = BatchedGatewayQuery(
                    x.sender,
                    x.gateways,
                    x.request
                );
            }
        }
        if (unresolved > 0) {
            assembly {
                mstore(queries, unresolved)
            }
            revert OffchainLookup(
                address(this),
                gateways,
                abi.encodeCall(IBatchedGateway.query, (queries)),
                this.batchedGatewayCallback.selector,
                abi.encode(lookup, res, gateways)
            );
        }
    }

    function batchedGatewayCallback(
        bytes calldata ccip,
        bytes calldata carry
    ) external view returns (Lookup memory lookup, Response[] memory res) {
        string[] memory gateways;
        (lookup, res, gateways) = abi.decode(
            carry,
            (Lookup, Response[], string[])
        );
        (bool[] memory failures, bytes[] memory responses) = abi.decode(
            ccip,
            (bool[], bytes[])
        );
        if (failures.length != responses.length) revert LengthMismatch();
        uint256 expected;
        for (uint256 i; i < res.length; i++) {
            Response memory r = res[i];
            if ((r.bits & ResponseBits.RESOLVED) == 0) {
                bytes memory v = responses[expected];
                if (failures[expected++]) {
                    r.bits |= ResponseBits.RESOLVED | ResponseBits.ERROR; // ccip-read failed
                } else {
                    OffchainLookupTuple memory x = EIP3668.decode(r.data);
                    bool ok;
                    (ok, v) = x.sender.staticcall(
                        abi.encodeWithSelector(x.selector, v, x.carry)
                    );
                    if (ok) {
                        if (_isExtendedResolver(lookup))
                            v = abi.decode(v, (bytes)); // unwrap
                        r.bits |= ResponseBits.RESOLVED;
                    } else if (bytes4(v) != OffchainLookup.selector) {
                        r.bits |= ResponseBits.RESOLVED | ResponseBits.ERROR; // callback failed
                    }
                }
                r.data = v;
            }
        }
        if (expected != responses.length) revert LengthMismatch();
        _revertBatchedGateway(lookup, res, gateways);
    }

    function resolveMulticallCallback(
        bytes memory ccip,
        bytes memory carry
    ) external pure returns (Lookup memory lookup, Response[] memory res) {
        (lookup, res) = abi.decode(carry, (Lookup, Response[]));
        if (_isExtendedResolver(lookup)) ccip = abi.decode(ccip, (bytes)); // unwrap
        bytes[] memory m = abi.decode(ccip, (bytes[]));
        uint256 expected;
        for (uint256 i; i < res.length; i++) {
            Response memory r = res[i];
            if ((r.bits & ResponseBits.RESOLVED) == 0) {
                bytes memory v = m[expected++];
                r.data = v;
                if ((v.length & 31) != 0) r.bits |= ResponseBits.ERROR;
                r.bits |= ResponseBits.RESOLVED;
            }
        }
        if (expected != m.length) revert LengthMismatch();
    }

    function _isExtendedResolver(
        Lookup memory lookup
    ) internal pure returns (bool) {
        return (lookup.bits & LookupBits.EXTENDED) != 0;
    }
}
