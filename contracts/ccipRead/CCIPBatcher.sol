// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IBatchGateway} from "./IBatchGateway.sol";
import {CCIPReader, EIP3668, OffchainLookup} from "./CCIPReader.sol";

abstract contract CCIPBatcher is CCIPReader {
    /// @notice The batch gateway supplied an incorrect number of responses.
    /// @dev Error selector: `0x4a5c31ea`
    error InvalidBatchGatewayResponse();

    uint256 constant FLAG_OFFCHAIN = 1 << 0; // the lookup reverted `OffchainLookup`
    uint256 constant FLAG_CALL_ERROR = 1 << 1; // the initial call or callback reverted
    uint256 constant FLAG_BATCH_ERROR = 1 << 2; // `OffchainLookup` failed on the batch gateway
    uint256 constant FLAG_EMPTY_RESPONSE = 1 << 3; // the initial call or callback returned `0x`
    uint256 constant FLAG_EIP140_BEFORE = 1 << 4; // does not have revert op code
    uint256 constant FLAG_EIP140_AFTER = 1 << 5; // has revert op code
    uint256 constant FLAG_DONE = 1 << 6; // the lookup has finished processing (private)

    uint256 constant FLAGS_ANY_ERROR =
        FLAG_CALL_ERROR | FLAG_BATCH_ERROR | FLAG_EMPTY_RESPONSE;
    uint256 constant FLAGS_ANY_EIP140 = FLAG_EIP140_BEFORE | FLAG_EIP140_AFTER;

    /// @dev An independent `OffchainLookup` session.
    struct Lookup {
        address target; // contract to call
        bytes call; // initial calldata
        bytes data; // response or error
        uint256 flags; // see: FLAG_*
    }

    /// @dev A batch gateway session.
    struct Batch {
        Lookup[] lookups;
        string[] gateways;
    }

    /// @dev Create a batch for a single target with multiple calls.
    /// @param target The target contract.
    /// @param calls The list of calldata.
    /// @param gateways The batch gateway URLs.
    function createBatch(
        address target,
        bytes[] memory calls,
        string[] memory gateways
    ) internal pure returns (Batch memory) {
        Lookup[] memory lookups = new Lookup[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            Lookup memory lu = lookups[i];
            lu.target = target;
            lu.call = calls[i];
        }
        return Batch(lookups, gateways);
    }

    /// @dev Use `ccipRead()` to call this function with a batch.
    ///      The callback response will be `abi.encode(batch)`.
    function ccipBatch(
        Batch memory batch
    ) external view returns (Batch memory) {
        for (uint256 i; i < batch.lookups.length; ++i) {
            Lookup memory lu = batch.lookups[i];
            if ((lu.flags & FLAGS_ANY_EIP140) == 0) {
                uint256 flags = detectEIP140(lu.target)
                    ? FLAG_EIP140_AFTER
                    : FLAG_EIP140_BEFORE;
                for (uint256 j = i; j < batch.lookups.length; ++j) {
                    if (batch.lookups[j].target == lu.target) {
                        batch.lookups[j].flags |= flags;
                    }
                }
            }
            bool unsafe = (lu.flags & FLAG_EIP140_AFTER) == 0;
            (bool ok, bytes memory v) = safeCall(!unsafe, lu.target, lu.call);
            if (!ok && bytes4(v) == OffchainLookup.selector) {
                lu.flags |= FLAG_OFFCHAIN;
            } else {
                lu.flags |= FLAG_DONE;
                if (unsafe && v.length == 0) {
                    // unsafe contracts appear the same for throw and unimplemented fallback
                    // decision: interpret like an unimplemented function selector response
                } else if (!ok) {
                    lu.flags |= FLAG_CALL_ERROR;
                }
                if (v.length == 0) {
                    lu.flags |= FLAG_EMPTY_RESPONSE;
                }
            }
            lu.data = v;
        }
        _revertBatchGateway(batch); // reverts if any offchain
        return batch;
    }

    /// @dev Check if the batch is "done".  If not, revert `OffchainLookup` for batch gateway.
    function _revertBatchGateway(Batch memory batch) internal view {
        IBatchGateway.Request[] memory requests = new IBatchGateway.Request[](
            batch.lookups.length
        );
        uint256 count;
        for (uint256 i; i < batch.lookups.length; ++i) {
            Lookup memory lu = batch.lookups[i];
            if ((lu.flags & FLAG_DONE) == 0) {
                EIP3668.Params memory p = decodeOffchainLookup(lu.data);
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

    /// @dev CCIP-Read callback for `ccipBatch()`.
    ///      Updates `batch` using the batch gateway response. Reverts again if not "done".
    /// @param response The response from the batch gateway.
    /// @param extraData The contextual data passed from `ccipBatch()`.
    /// @return batch The batch where every lookup is "done".
    function ccipBatchCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (Batch memory batch) {
        (bool[] memory failures, bytes[] memory responses) = abi.decode(
            response,
            (bool[], bytes[])
        );
        if (failures.length != responses.length) {
            revert InvalidBatchGatewayResponse();
        }
        batch = abi.decode(extraData, (Batch));
        uint256 expected;
        for (uint256 i; i < batch.lookups.length; ++i) {
            Lookup memory lu = batch.lookups[i];
            if ((lu.flags & FLAG_DONE) == 0) {
                if (expected < responses.length) {
                    bytes memory v = responses[expected];
                    if (failures[expected]) {
                        lu.flags |= FLAG_DONE | FLAG_BATCH_ERROR;
                    } else {
                        EIP3668.Params memory p = decodeOffchainLookup(lu.data);
                        bool ok;
                        // assumption: unsafe contracts don't revert OffchainLookup()
                        (ok, v) = p.sender.staticcall(
                            abi.encodeWithSelector(
                                p.callbackFunction,
                                v,
                                p.extraData
                            )
                        );
                        if (ok || bytes4(v) != OffchainLookup.selector) {
                            lu.flags |= FLAG_DONE;
                            // decision: promote empty response from the callback => call error
                            // ie. the initial function was implemented but the callback was not
                            // this can be detected via FLAG_OFFCHAIN
                            if (!ok || v.length == 0) {
                                lu.flags |= FLAG_CALL_ERROR;
                            }
                            if (v.length == 0) {
                                lu.flags |= FLAG_EMPTY_RESPONSE;
                            }
                        }
                    }
                    lu.data = v;
                }
                ++expected;
            }
        }
        if (expected != responses.length) {
            revert InvalidBatchGatewayResponse();
        }
        _revertBatchGateway(batch);
    }
}
