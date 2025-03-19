// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @author Modified from https://github.com/unruggable-labs/CCIPReader.sol/blob/341576fe7ff2b6e0c93fc08f37740cf6439f5873/contracts/CCIPReader.sol

/// MIT License
/// Portions Copyright (c) 2025 Unruggable
/// Portions Copyright (c) 2025 ENS Labs Ltd

/// @dev Instructions:
/// 1. inherit this contract
/// 2. call `ccipRead()` similar to `staticcall()`
/// 3. implement all response logic in callback
/// 4. ensure that return type of calling function == callback function
/// 5. any return value of `ccipRead()` is abi-encoded

/// Use the following code to return it directly:
/// ```solidity
/// bytes memory v = ccipRead(...);
/// assembly { return(add(v, 32), mload(v)) }
/// ```

import {EIP3668, OffchainLookup} from "./EIP3668.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";

contract CCIPReader {
    /// @dev Recursive CCIP-Read data structure (private)
    struct Context {
        address target;
        bytes4 callbackFunction;
        bytes extraData;
        bytes4 myCallbackFunction;
        bytes myExtraData;
    }

    bytes4 constant IDENTITY_SELECTOR = bytes4(0);

    /// @dev Same as `ccipRead()` but the callback function is the identity.
    function ccipRead(
        address target,
        bytes memory call
    ) internal view returns (bytes memory) {
        return ccipRead(target, call, IDENTITY_SELECTOR, "");
    }

    /// @dev Performs a CCIP-Read and handles internal recursion.
    ///      Reverts `OffchainLookup` if necessary.
    /// @param target The contract address.
    /// @param call The calldata to `staticcall()` on `target`.
    /// @param callbackFunction The function selector of callback.
    /// @param extraData The contextual data relayed to `callbackFunction`.
    /// @return v The ABI-encoded response if no `OffchainLookup` was required.
    function ccipRead(
        address target,
        bytes memory call,
        bytes4 callbackFunction,
        bytes memory extraData
    ) internal view returns (bytes memory v) {
        // We call the intended function that **could** revert with an `OffchainLookup`
        // We destructure the response into an execution status bool and our return bytes
        bool ok;
        (ok, v) = target.staticcall(call);
        // IF the function reverted with an `OffchainLookup`
        if (!ok && bytes4(v) == OffchainLookup.selector) {
            // We decode the response error into a tuple
            // tuples allow flexibility noting stack too deep constraints
            EIP3668.Params memory p = decodeOffchainLookup(v);
            if (p.sender == target) {
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
                            callbackFunction,
                            extraData
                        )
                    )
                );
            }
        }
        // IF we have gotten here, the 'real' target does not revert with an `OffchainLookup` error
        if (ok && callbackFunction != IDENTITY_SELECTOR) {
            // The exit point of this architecture is  OUR callback in the 'real'
            // We pass through the response to that callback
            (ok, v) = address(this).staticcall(
                abi.encodeWithSelector(callbackFunction, v, extraData)
            );
        }
        // OR the call to the 'real' target reverts with a different error selector
        // OR the call to OUR callback reverts with ANY error selector
        if (!ok) {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
    }

    /// @dev CCIP-Read callback for `ccipRead()`.
    /// @param ccip The response from offchain.
    /// @param extraData The contextual data passed from `ccipRead()`.
    /// @dev The return type of this function is polymorphic depending on the caller.
    function ccipReadCallback(
        bytes memory ccip,
        bytes memory extraData
    ) external view {
        Context memory ctx = abi.decode(extraData, (Context));
        // Since the callback can revert too (but has the same return structure)
        // We can reuse the calling infrastructure to call the callback
        bytes memory v = ccipRead(
            ctx.target,
            abi.encodeWithSelector(ctx.callbackFunction, ccip, ctx.extraData),
            ctx.myCallbackFunction,
            ctx.myExtraData
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    /// @dev Decode `OffchainLookup` error data into a struct.
    /// @param v The error data of the revert.
    /// @return p The decoded `OffchainLookup` params.
    function decodeOffchainLookup(
        bytes memory v
    ) internal pure returns (EIP3668.Params memory p) {
        p = EIP3668.decode(BytesUtils.substring(v, 4, v.length - 4));
    }
}
