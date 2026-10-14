// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @author Modified from https://github.com/unruggable-labs/CCIPReader.sol/blob/341576fe7ff2b6e0c93fc08f37740cf6439f5873/contracts/CCIPReader.sol

/// MIT License
/// Portions Copyright (c) 2025 Unruggable
/// Portions Copyright (c) 2025 ENS Labs Ltd

/// @dev Instructions:
/// 1. inherit this contract
/// 2. call `ccipRead()` similar to `staticcall()`
/// 3. do not put logic after this invocation
/// 4. implement all response logic in callback
/// 5. ensure that return type of calling function == callback function

import {EIP3668, OffchainLookup} from "./EIP3668.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";

contract CCIPReader {
    /// @dev Default unsafe call gas (sufficient for legacy ENS resolver profiles).
    uint256 constant DEFAULT_UNSAFE_CALL_GAS = 50000;

    /// @dev Special-purpose value for identity callback: `f(x) = x`.
    bytes4 constant IDENTITY_FUNCTION = bytes4(0);

    /// @notice The sender of the `OffchainLookup` was unexpected.
    /// @dev Error selector: `0x8f2df4ed`
    error InvalidOffchainLookup();

    /// @dev The gas limit for calling functions on unsafe contracts.
    uint256 immutable unsafeCallGas;

    constructor(uint256 _unsafeCallGas) {
        unsafeCallGas = _unsafeCallGas;
    }

    /// @dev A recursive CCIP-Read session.
    struct Context {
        address target;
        bytes4 callbackFunction;
        bytes extraData;
        bytes4 successCallbackFunction;
        bytes4 failureCallbackFunction;
        bytes myExtraData;
    }

    /// @dev Same as `ccipRead()` but the callback function is the identity.
    function ccipRead(address target, bytes memory call) internal view {
        ccipRead(target, call, IDENTITY_FUNCTION, IDENTITY_FUNCTION, "");
    }

    /// @dev Call a function that may require CCIP-Read and handle internal recursion.
    ///      Warning: External calls during call and callback must be guarded for unexpected OffchainLookup reverts.
    ///      Reverts `InvalidOffchainLookup` if `target` did not handle internal recursion.
    ///      Reverts `OffchainLookup` if `target` required CCIP-Read.
    ///      Use `IDENTITY_FUNCTION` as the callback function selector for return/revert behavior.
    /// @param target The contract address.
    /// @param data The calldata to `staticcall()` on `target`.
    /// @param successCallbackFunction The function selector of callback on success.
    /// @param failureCallbackFunction The function selector of callback on failure.
    /// @param extraData The contextual data relayed to callback function.
    function ccipRead(
        address target,
        bytes memory data,
        bytes4 successCallbackFunction,
        bytes4 failureCallbackFunction,
        bytes memory extraData
    ) internal view {
        // We call the intended function that **could** revert with an `OffchainLookup`
        // We destructure the response into an execution status bool and our return bytes
        (bool ok, bytes memory v) = safeCall(
            detectEIP140(target),
            target,
            data
        );
        // IF the function reverted with an `OffchainLookup`
        if (!ok && bytes4(v) == OffchainLookup.selector) {
            // We decode the response error into a tuple
            // tuples allow flexibility noting stack too deep constraints
            EIP3668.Params memory p = decodeOffchainLookup(v);
            if (p.sender != target) {
                revert InvalidOffchainLookup(); // terminate immediately instead of bubbling
            }
            // We then wrap the error data in an `OffchainLookup` sent/'owned' by this contract
            revert OffchainLookup(
                address(this),
                p.urls,
                p.callData,
                this.ccipReadCallback.selector,
                abi.encode(
                    Context(
                        target,
                        p.callbackFunction,
                        p.extraData,
                        successCallbackFunction,
                        failureCallbackFunction,
                        extraData
                    )
                )
            );
        }
        // IF we have gotten here, the 'real' target does not revert with an `OffchainLookup` error
        // figure out what callback to call
        bytes4 callbackFunction = ok
            ? successCallbackFunction
            : failureCallbackFunction;
        if (callbackFunction != IDENTITY_FUNCTION) {
            // The exit point of this architecture is OUR callback in the 'real'
            // We pass through the response to that callback
            (ok, v) = address(this).staticcall(
                abi.encodeWithSelector(callbackFunction, v, extraData)
            );
        }
        // OR the call to the 'real' target reverts with a different error selector
        // OR the call to OUR callback reverts with ANY error selector
        if (ok) {
            assembly {
                return(add(v, 32), mload(v))
            }
        } else {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
    }

    /// @dev CCIP-Read callback for `ccipRead()`.
    /// @param response The response from offchain.
    /// @param extraData The contextual data passed from `ccipRead()`.
    /// @dev The return type of this function is polymorphic depending on the caller.
    function ccipReadCallback(
        bytes memory response,
        bytes memory extraData
    ) external view {
        Context memory ctx = abi.decode(extraData, (Context));
        // Since the callback can revert too (but has the same return structure)
        // We can reuse the calling infrastructure to call the callback
        ccipRead(
            ctx.target,
            abi.encodeWithSelector(
                ctx.callbackFunction,
                response,
                ctx.extraData
            ),
            ctx.successCallbackFunction,
            ctx.failureCallbackFunction,
            ctx.myExtraData
        );
    }

    /// @dev Decode `OffchainLookup` error data into a struct.
    /// @param v The error data of the revert.
    /// @return p The decoded `OffchainLookup` params.
    function decodeOffchainLookup(
        bytes memory v
    ) internal pure returns (EIP3668.Params memory p) {
        p = EIP3668.decode(BytesUtils.substring(v, 4, v.length - 4));
    }

    /// @dev Determine if `target` uses `revert()` instead of `invalid()`.
    //       Assumption: only newer contracts revert `OffchainLookup`.
    /// @param target The contract to test.
    /// @return safe True if safe to call.
    function detectEIP140(address target) internal view returns (bool safe) {
        if (target == address(this)) return true;
        // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-140.md
        assembly {
            let G := 5000
            let g := gas()
            pop(staticcall(G, target, 0, 0, 0, 0))
            safe := lt(sub(g, gas()), G)
        }
    }

    /// @dev Same as `staticcall()` but prevents OOG when not `safe`.
    function safeCall(
        bool safe,
        address target,
        bytes memory data
    ) internal view returns (bool ok, bytes memory v) {
        (ok, v) = target.staticcall{gas: safe ? gasleft() : unsafeCallGas}(
            data
        );
    }

    /// @dev Perform a call and prevent `OffchainLookup` revert.
    function callRejectingOffchainLookup(
        address target,
        bytes memory data
    ) internal view returns (bytes memory) {
        (bool ok, bytes memory v) = target.staticcall{gas: gasleft()}(data);
        if (ok) {
            return v;
        } else if (bytes4(v) == OffchainLookup.selector) {
            revert InvalidOffchainLookup();
        } else {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
    }
}
