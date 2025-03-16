// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165, ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {ENS} from "../registry/ENS.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {NameCoder} from "../utils/NameCoder.sol";
import {IBatchGateway} from "../utils/IBatchGateway.sol";
import {IForwardResolution, Lookup, LookupBits, Response, ResponseBits, LengthMismatch} from "./IForwardResolution.sol";
import {CCIPReader, EIP3668, OffchainLookup} from "../ccipRead/CCIPReader.sol";

contract ForwardResolutionV1 is
    IForwardResolution,
    IERC165,
    CCIPReader,
    Ownable
{
    address public immutable registry;
    string[] public batchGateways;

    constructor(address ens, string[] memory gateways) {
        registry = ens;
        batchGateways = gateways;
    }

    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            type(IERC165).interfaceId == x ||
            type(IForwardResolution).interfaceId == x;
    }

    function setBatchGateways(string[] memory gateways) external onlyOwner {
        batchGateways = gateways;
    }

    function lookupName(
        bytes memory name
    ) public view returns (Lookup memory lookup) {
        // https://docs.ens.domains/ensip/10
        uint256 offset;
        address resolver;
        bytes32 node = NameCoder.namehash(name, 0);
        lookup.name = name;
        lookup.node = node;
        lookup.registry = registry; // always the same
        while (true) {
            resolver = ENS(registry).resolver(node);
            if (resolver != address(0)) break; // found a resolver
            uint256 size = uint8(name[offset]);
            if (size == 0) return lookup; // no match
            offset += 1 + size;
            node = NameCoder.namehash(name, offset);
        }
        if (
            ERC165Checker.supportsERC165InterfaceUnchecked(
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
            return lookup; // resolver must be a contract
        }
        lookup.offset = offset; // offset into name
        lookup.bits |= LookupBits.OK;
    }

    function resolve(
        bytes memory name,
        bytes[] memory calls,
        string[] memory gateways
    ) external view returns (Lookup memory lookup, Response[] memory res) {
        lookup = lookupName(name);
        if (lookup.bits == 0) return (lookup, res);
        res = new Response[](calls.length); // create result storage
        if (gateways.length == 0) gateways = batchGateways; // use default
        uint256 offchain; // count how many offchain
        for (uint256 i; i < res.length; i++) {
            bytes memory call = calls[i];
            (, bool ok, bytes memory v) = _callResolver(lookup, call);
            Response memory r = res[i];
            r.call = call; // remember calldata (post-inject, pre-resolve)
            r.data = v;
            if (!ok && bytes4(v) == OffchainLookup.selector) {
                r.bits |= ResponseBits.OFFCHAIN;
                offchain++;
            } else {
                if (!ok) r.bits |= ResponseBits.ERROR;
                r.bits |= ResponseBits.RESOLVED;
            }
        }
        if (offchain > 0) _revertBatchGateway(lookup, res, gateways);
    }

    function _callResolver(
        Lookup memory lookup,
        bytes memory call0
    ) internal view returns (bytes memory call, bool ok, bytes memory v) {
        call = call0;
        if (_isExtended(lookup)) {
            call = abi.encodeCall(
                IExtendedResolver.resolve,
                (lookup.name, call)
            ); // wrap
        }
        (ok, v) = lookup.resolver.staticcall(call); // call it
        if (ok && _isExtended(lookup)) v = abi.decode(v, (bytes)); // unwrap
    }

    function _revertBatchGateway(
        Lookup memory lookup,
        Response[] memory res,
        string[] memory gateways
    ) internal view {
        IBatchGateway.Query[] memory queries = new IBatchGateway.Query[](
            res.length
        );
        uint256 unresolved;
        for (uint256 i; i < res.length; i++) {
            Response memory r = res[i];
            if ((r.bits & ResponseBits.RESOLVED) == 0) {
                r.bits |= ResponseBits.BATCHED;
                EIP3668.Params memory x = EIP3668.decodeWithSelector(r.data);
                queries[unresolved++] = IBatchGateway.Query(
                    x.sender,
                    x.urls,
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
                abi.encodeCall(IBatchGateway.query, (queries)),
                this.batchGatewayCallback.selector,
                abi.encode(lookup, res, gateways)
            );
        }
    }

    function batchGatewayCallback(
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
                    EIP3668.Params memory x = EIP3668.decodeWithSelector(
                        r.data
                    );
                    bool ok;
                    (ok, v) = x.sender.staticcall(
                        abi.encodeWithSelector(x.selector, v, x.carry)
                    );
                    if (ok) {
                        if (_isExtended(lookup)) v = abi.decode(v, (bytes)); // unwrap
                        r.bits |= ResponseBits.RESOLVED;
                    } else if (bytes4(v) != OffchainLookup.selector) {
                        r.bits |= ResponseBits.RESOLVED | ResponseBits.ERROR; // callback failed
                    }
                }
                r.data = v;
            }
        }
        if (expected != responses.length) revert LengthMismatch();
        _revertBatchGateway(lookup, res, gateways);
    }

    function _isExtended(Lookup memory lookup) internal pure returns (bool) {
        return (lookup.bits & LookupBits.EXTENDED) != 0;
    }
}
