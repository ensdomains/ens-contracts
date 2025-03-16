// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @author Modified from Unruggable https://github.com/unruggable-labs/CCIPReader.sol/

/*
MIT License

Copyright (c) 2025 Unruggable

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/// @dev Instructions:
/// 1. inherit this contract
/// 2. call `ccipRead()` similar to `staticcall()`
/// 3. implement all response logic in callback
/// 4. ensure that return type of calling function == callback function
/// 5. any return value of `ccipRead()` is already abi-encoded

/// Use the following code to return it directly:
/// ```solidity
/// bytes memory v = ccipRead(...);
/// assembly { return(add(v, 32), mload(v)) }
/// ```

import {EIP3668, OffchainLookup} from "./EIP3668.sol";

contract CCIPReader {
    /// @dev A function that wraps, handles, and consistently returns responses from calls to a function within a target contract that can return directly OR return in response to offchain data resolution (subject to the ERC-3668 specification).
    /// @param target contract address
    /// @param call calldata to `staticcall()` on `target`
    /// @param myCallbackFunction function selector of callback
    /// @param myExtraData extra data passed to `mySelector` along with response bytes
    /// @return v abi-encoded response from calling `mySelector` or revert
    function ccipRead(
        address target,
        bytes memory call,
        bytes4 myCallbackFunction,
        bytes memory myExtraData
    ) internal view returns (bytes memory v) {
        // We call the intended function that **could** revert with an `OffchainLookup`
        // We destructure the response into an execution status bool and our return bytes
        bool ok;
        (ok, v) = target.staticcall(call);
        // IF the function reverted with an `OffchainLookup`
        if (!ok && bytes4(v) == OffchainLookup.selector) {
            // We decode the response error into a tuple
            // tuples allow flexibility noting stack too deep constraints
            EIP3668.Params memory p = EIP3668.decodeWithSelector(v);
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
                            myCallbackFunction,
                            myExtraData
                        )
                    )
                );
            }
        }
        // IF we have gotten here, the 'real' target does not revert with an `OffchainLookup` error
        if (ok) {
            // The exit point of this architecture is  OUR callback in the 'real'
            // We pass through the response to that callback
            (ok, v) = address(this).staticcall(
                abi.encodeWithSelector(myCallbackFunction, v, myExtraData)
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

    function ccipReadCallback(
        bytes memory ccip,
        bytes memory extraData
    ) external view {
        Context memory state = abi.decode(extraData, (Context));
        // Since the callback can revert too (but has the same return structure)
        // We can reuse the calling infrastructure to call the callback
        bytes memory v = ccipRead(
            state.target,
            abi.encodeWithSelector(
                state.callbackFunction,
                ccip,
                state.extraData
            ),
            state.myCallbackFunction,
            state.myExtraData
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }
}

// for internal use
struct Context {
    address target;
    bytes4 callbackFunction;
    bytes extraData;
    bytes4 myCallbackFunction;
    bytes myExtraData;
}
