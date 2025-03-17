// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IBatchGateway} from "./IBatchGateway.sol";
import {CCIPReader, EIP3668, OffchainLookup} from "./CCIPReader.sol";
import "hardhat/console.sol";

contract CCIPBatcher is CCIPReader {
    error LengthMismatch();

    uint256 constant FLAG_OFFCHAIN = 1 << 0;
    uint256 constant FLAG_CALL_ERROR = 1 << 1;
    uint256 constant FLAG_OFFCHAIN_ERROR = 1 << 2;
    uint256 constant FLAG_EMPTY_RESPONSE = 1 << 3;
    uint256 constant FLAG_DONE = 1 << 4;

    uint256 constant FLAGS_ANY_ERROR =
        FLAG_CALL_ERROR | FLAG_OFFCHAIN_ERROR | FLAG_EMPTY_RESPONSE;

    struct Lookup {
        address target;
        bytes call;
        bytes data;
        uint256 flags;
    }

    struct Batch {
        Lookup[] lookups;
        string[] gateways;
    }

    function ccipBatch(
        Batch memory batch
    ) external view returns (Batch memory) {
        for (uint256 i; i < batch.lookups.length; i++) {
            Lookup memory lu = batch.lookups[i];
            (bool ok, bytes memory v) = lu.target.staticcall(lu.call);
            if (v.length == 0) {
                v = abi.encodePacked(bytes4(lu.call));
                lu.flags |= FLAG_DONE | FLAG_EMPTY_RESPONSE;
            } else if (ok) {
                lu.flags |= FLAG_DONE;
            } else if (bytes4(v) != OffchainLookup.selector) {
                lu.flags |= FLAG_DONE | FLAG_CALL_ERROR;
            } else {
                lu.flags |= FLAG_OFFCHAIN;
            }
            lu.data = v;
        }
        _revertBatchGateway(batch);
        return batch;
    }

    function _revertBatchGateway(Batch memory batch) internal view {
        IBatchGateway.Request[] memory requests = new IBatchGateway.Request[](
            batch.lookups.length
        );
        uint256 count;
        for (uint256 i; i < batch.lookups.length; i++) {
            Lookup memory lu = batch.lookups[i];
            if ((lu.flags & FLAG_DONE) == 0) {
                EIP3668.Params memory p = EIP3668.decodeWithSelector(lu.data);
                requests[count++] = IBatchGateway.Request(
                    p.sender,
                    p.urls,
                    p.callData
                );
            }
        }
        if (count > 0) {
            assembly {
                mstore(requests, count) // truncate to number of offchain requests
            }
            revert OffchainLookup(
                address(this),
                batch.gateways,
                abi.encodeCall(IBatchGateway.query, (requests)),
                this.ccipBatchCallback.selector,
                abi.encode(batch)
            );
        }
    }

    function ccipBatchCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (Batch memory batch) {
        (bool[] memory failures, bytes[] memory responses) = abi.decode(
            response,
            (bool[], bytes[])
        );
        if (failures.length != responses.length) revert LengthMismatch();
        batch = abi.decode(extraData, (Batch));
        uint256 expected;
        for (uint256 i; i < batch.lookups.length; i++) {
            Lookup memory lu = batch.lookups[i];
            if ((lu.flags & FLAG_DONE) == 0) {
                bytes memory v = responses[expected];
                if (failures[expected++]) {
                    lu.flags |= FLAG_DONE | FLAG_OFFCHAIN_ERROR;
                } else {
                    EIP3668.Params memory p = EIP3668.decodeWithSelector(
                        lu.data
                    );
                    bool ok;
                    (ok, v) = p.sender.staticcall(
                        abi.encodeWithSelector(
                            p.callbackFunction,
                            v,
                            p.extraData
                        )
                    );
                    if (v.length == 0) {
                        v = abi.encodePacked(p.callbackFunction);
                        lu.flags |= FLAG_DONE | FLAG_EMPTY_RESPONSE;
                    } else if (ok) {
                        lu.flags |= FLAG_DONE;
                    } else if (bytes4(v) != OffchainLookup.selector) {
                        lu.flags |= FLAG_DONE | FLAG_CALL_ERROR;
                    } else {
                        // another offchain request
                    }
                }
                lu.data = v;
            }
        }
        if (expected != responses.length) revert LengthMismatch();
        _revertBatchGateway(batch);
    }
}
