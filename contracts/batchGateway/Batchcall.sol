// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {IBatchGateway} from "./IBatchGateway.sol";
import {IBatchcall, Thread, ThreadBits} from "./IBatchcall.sol";
import {CCIPReader, EIP3668, OffchainLookup} from "../ccipRead/CCIPReader.sol";

contract Batchcall is CCIPReader, IBatchcall, IERC165 {
    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            type(IERC165).interfaceId == x || type(IBatchcall).interfaceId == x;
    }

    function batch(
        Thread[] memory threads,
        string[] memory gateways
    ) external view returns (Thread[] memory) {
        for (uint256 i; i < threads.length; i++) {
            Thread memory t = threads[i];
            (bool ok, bytes memory v) = t.target.staticcall(t.call);
            if (v.length == 0) {
                v = abi.encodePacked(bytes4(t.call)); // remember the function
                t.bits |= ThreadBits.DONE | ThreadBits.EMPTY_RESPONSE;
            } else if (ok) {
                t.bits |= ThreadBits.DONE;
            } else if (bytes4(v) != OffchainLookup.selector) {
                t.bits |= ThreadBits.DONE | ThreadBits.CALL_ERROR;
            } else {
                t.bits |= ThreadBits.OFFCHAIN;
            }
            t.data = v;
        }
        _revertBatchGateway(threads, gateways);
        return threads;
    }

    function _revertBatchGateway(
        Thread[] memory threads,
        string[] memory gateways
    ) internal view {
        IBatchGateway.Request[] memory requests = new IBatchGateway.Request[](
            threads.length
        );
        uint256 count;
        for (uint256 i; i < threads.length; i++) {
            Thread memory t = threads[i];
            if ((t.bits & ThreadBits.DONE) == 0) {
                EIP3668.Params memory p = EIP3668.decodeWithSelector(t.data);
                requests[count++] = IBatchGateway.Request(
                    p.sender,
                    p.urls,
                    p.callData
                );
            }
        }
        if (count > 0) {
            assembly {
                mstore(requests, count)
            }
            revert OffchainLookup(
                address(this),
                gateways,
                abi.encodeCall(IBatchGateway.query, (requests)),
                this.batchCallback.selector,
                abi.encode(threads, gateways)
            );
        }
    }

    function batchCallback(
        bytes calldata ccip,
        bytes calldata extraData
    ) external view returns (Thread[] memory threads) {
        (bool[] memory failures, bytes[] memory responses) = abi.decode(
            ccip,
            (bool[], bytes[])
        );
        if (failures.length != responses.length) revert LengthMismatch();
        string[] memory gateways;
        (threads, gateways) = abi.decode(extraData, (Thread[], string[]));
        uint256 expected;
        for (uint256 i; i < threads.length; i++) {
            Thread memory t = threads[i];
            if ((t.bits & ThreadBits.DONE) == 0) {
                bytes memory v = responses[expected];
                if (failures[expected++]) {
                    t.bits |= ThreadBits.DONE | ThreadBits.OFFCHAIN_ERROR;
                } else {
                    EIP3668.Params memory p = EIP3668.decodeWithSelector(
                        t.data
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
                        t.bits |= ThreadBits.DONE | ThreadBits.EMPTY_RESPONSE;
                    } else if (ok) {
                        t.bits |= ThreadBits.DONE;
                    } else if (bytes4(v) != OffchainLookup.selector) {
                        t.bits |= ThreadBits.DONE | ThreadBits.CALL_ERROR;
                    }
                }
                t.data = v;
            }
        }
        if (expected != responses.length) revert LengthMismatch();
        _revertBatchGateway(threads, gateways);
    }
}
