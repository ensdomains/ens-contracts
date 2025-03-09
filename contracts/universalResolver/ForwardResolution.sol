// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ENS} from "../registry/ENS.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {ERC165, IERC165} from "../utils/ERC165.sol";
import {IResolveMulticall} from "../utils/IResolveMulticall.sol";
import {BytesUtilsEncrypted} from "../utils/BytesUtilsEncrypted.sol";
import {IBatchedGateway, BatchedGatewayQuery} from "../utils/IBatchedGateway.sol";
import {IForwardResolution, Lookup, Response, ResponseBits, LengthMismatch} from "./IForwardResolution.sol";
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
        bytes memory dns
    ) public view returns (Lookup memory lookup) {
        // https://docs.ens.domains/ensip/10
        uint256 offset;
        address resolver;
        bytes32 node = BytesUtilsEncrypted.namehash(dns, 0);
        lookup.dns = dns;
        lookup.node = node;
        while (true) {
            resolver = ENS(registry).resolver(node);
            if (resolver != address(0)) break;
            uint256 size = uint8(dns[offset]);
            if (size == 0) return lookup; // no match
            offset = 1 + size;
            node = BytesUtilsEncrypted.namehash(dns, offset);
        }
        if (ERC165.supportsInterface(resolver, type(IExtendedResolver).interfaceId)) {
            lookup.extended = true;
        } else if (offset != 0) {
            return lookup; // non-extended resolver requires exact match
        }
        lookup.resolver = resolver;
        lookup.basenode = node; // node of resolver
        lookup.offset = offset;
    }

    function resolve(
        bytes memory dns,
        bytes[] memory calls,
        string[] memory gateways
    ) external view returns (Lookup memory lookup, Response[] memory res) {
        lookup = lookupName(dns);
        if (lookup.resolver == address(0)) return (lookup, res);
        res = new Response[](calls.length); // create result storage
        if (gateways.length == 0) gateways = batchedGateways; // use default
        bytes[] memory offchainCalls = new bytes[](calls.length);
        uint256 offchain; // count how many offchain
        for (uint256 i; i < res.length; i++) {
            bytes memory call = calls[i];
            (bool ok, bytes memory v) = _callResolver(lookup, call);
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
            (bool ok, bytes memory v) = _callResolver(
                lookup,
                abi.encodeCall(IResolveMulticall.multicall, (offchainCalls))
            );
            if (!ok && bytes4(v) == OffchainLookup.selector) {
                // assumes resolvers that revert for resolve(multicall) support wrapping
                ccipRead(
                    lookup.resolver,
                    v,
                    this.resolveMulticallCallback.selector,
                    abi.encode(lookup, res)
                );
            }
        }
        _revertBatchedGateway(lookup, res, gateways);
    }

    function _callResolver(
        Lookup memory lookup,
        bytes memory call
    ) internal view returns (bool ok, bytes memory v) {
        if (lookup.extended)
            call = abi.encodeCall(
                IExtendedResolver.resolve,
                (lookup.dns, call)
            ); // wrap
        (ok, v) = lookup.resolver.staticcall(call); // call it
        if (ok && lookup.extended) v = abi.decode(v, (bytes)); // unwrap
    }

    function _revertBatchedGateway(
        Lookup memory lookup,
        Response[] memory res,
        string[] memory gateways
    ) internal view {
        BatchedGatewayQuery[] memory queries = new BatchedGatewayQuery[](
            res.length
        );
        uint256 missing;
        for (uint256 i; i < res.length; i++) {
            Response memory r = res[i];
            if ((r.bits & ResponseBits.RESOLVED) == 0) {
                r.bits |= ResponseBits.BATCHED;
                OffchainLookupTuple memory x = EIP3668.decode(r.data);
                queries[missing++] = BatchedGatewayQuery(
                    x.sender,
                    x.gateways,
                    x.request
                );
            }
        }
        if (missing > 0) {
            assembly {
                mstore(queries, missing)
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
                    OffchainLookupTuple memory x = EIP3668.decode(
                        r.data
                    );
                    bool ok;
                    (ok, v) = x.sender.staticcall(
                        abi.encodeWithSelector(x.selector, v, x.carry)
                    );
                    if (ok) {
                        if (
                            bytes4(x.request) ==
                            IExtendedResolver.resolve.selector
                        ) {
                            v = abi.decode(v, (bytes)); // unwrap
                        }
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
}
