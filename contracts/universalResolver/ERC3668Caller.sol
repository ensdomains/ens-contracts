// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";
import {ERC3668Utils, OffchainLookup, OffchainLookupData} from "../utils/ERC3668Utils.sol";

/// @notice Allows contracts to easily make ERC3668-compatible calls.
abstract contract ERC3668Caller {
    // This contract uses callback functions for data manipulation and error handling.
    // The user-definable callback functions are as follows:
    // - internalCallbackFunction:
    //   - Called when the call is successful.
    //   - Used to get the final result for the call.
    //   - Can return anything.
    //   - Signature: `function (bytes calldata response, bytes calldata extraData) external`
    // - lookupCalldataRewriteFunction:
    //   - Called when the call reverted with an OffchainLookup.
    //   - Used to rewrite the calldata for the offchain lookup.
    //   - Should return the rewritten calldata as bytes.
    //   - Signature: `function (OffchainLookupData calldata data) external returns (bytes)`
    // - failureCallbackFunction:
    //   - Called when the call reverted with an error.
    //   - Used to get the final result for the call.
    //   - Can return anything.
    //   - Signature: `function (bytes calldata response, bytes calldata extraData) external`
    // - validateLookupResponseFunction:
    //   - Called when the offchain lookup response is received.
    //   - Used to validate the response from the offchain lookup.
    //   - Should not return anything, instead it should revert if the response is invalid.
    //   - Signature: `function (bytes calldata response) external`
    // The user-definable callback functions can be encoded with `createUserCallbackFunctions`,
    // into a single uint128 value. The serialised value can then be passed into `call`.
    // The callbackFunctions value stored in `extraData` also includes the external callback function.

    // Callback functions are encoded as a single uint256 value
    // The first 4 bytes are the internal callback function
    // The next 4 bytes are the lookup calldata rewrite function
    // The next 4 bytes are the failure callback function
    // The next 4 bytes are the validate lookup response function
    // The next 4 bytes are the external callback function
    // The remaining 12 bytes are unused
    uint16 constant INTERNAL_CALLBACK_FUNCTION_OFFSET = 160;
    uint16 constant FAILURE_CALLBACK_FUNCTION_OFFSET = 192;
    uint16 constant EXTERNAL_CALLBACK_FUNCTION_OFFSET = 224;
    uint32 constant FUNCTIONS_MASK = 0xffffffff;

    /// @notice The ERC3668 sender does not match the target address.
    error LookupSenderMismatched();

    /// @notice Makes an ERC3668-compatible call.
    /// @param target The target address.
    /// @param gas The gas limit, or 0 for unlimited.
    /// @param data The calldata.
    /// @param internalExtraData The extra data to pass to the callback functions.
    /// @param internalCallbackFunction The internal callback function.
    /// @param failureCallbackFunction The failure callback function.
    /// @dev Resulting data is returned in the callback function.
    function call(
        address target,
        uint256 gas,
        bytes memory data,
        bytes memory internalExtraData,
        bytes4 internalCallbackFunction,
        bytes4 failureCallbackFunction
    ) internal view {
        (bool success, bytes4 errorId, bytes memory result) = ERC3668Utils
            .callWithNormalisedResult(target, data, gas);

        if (success) {
            _internalCallback(
                internalCallbackFunction,
                result,
                internalExtraData
            );
        }

        if (errorId == OffchainLookup.selector) {
            OffchainLookupData memory lookupData = ERC3668Utils
                .getOffchainLookupData(result);

            if (lookupData.sender != target) revert LookupSenderMismatched();

            bytes memory extraData = _createExtraData(
                target,
                internalCallbackFunction,
                failureCallbackFunction,
                lookupData.callbackFunction,
                internalExtraData,
                lookupData.extraData
            );

            bytes memory rewrittenCallData = lookupCalldataRewrite(
                lookupData,
                internalCallbackFunction
            );
            if (rewrittenCallData.length > 0)
                lookupData.callData = rewrittenCallData;

            revert OffchainLookup(
                address(this),
                lookupData.urls,
                lookupData.callData,
                ERC3668Caller.callback.selector,
                extraData
            );
        }

        bool isEmpty = errorId == bytes4(0) && result.length == 0;
        bytes memory errorData = isEmpty
            ? bytes("")
            : bytes.concat(errorId, result);

        if (failureCallbackFunction != bytes4(0)) {
            _internalCallback(
                failureCallbackFunction,
                errorData,
                internalExtraData
            );
        }

        // unknown error, propagate the revert
        LowLevelCallUtils.propagateRevert(errorData);
    }

    /// @notice The ERC3668 callback function.
    /// @param response The response from the ERC3668 call, arbitrary data.
    /// @param extraData The passthrough data from `call`, encoded as `(address target, uint256 callbackFunctions, bytes internalExtraData, bytes externalExtraData)`.
    function callback(
        bytes calldata response,
        bytes calldata extraData
    ) external view {
        (
            address target,
            bytes4 internalCallbackFunction,
            bytes4 failureCallbackFunction,
            bytes4 externalCallbackFunction,
            bytes memory internalExtraData,
            bytes memory externalExtraData
        ) = _getExtraData(extraData);

        validateLookupResponse(response, internalCallbackFunction);

        return
            call(
                target,
                0,
                bytes.concat(
                    externalCallbackFunction,
                    abi.encode(response, externalExtraData)
                ),
                internalExtraData,
                internalCallbackFunction,
                failureCallbackFunction
            );
    }

    function validateLookupResponse(
        bytes calldata response,
        bytes4 internalCallbackFunction
    ) internal view virtual {}

    function lookupCalldataRewrite(
        OffchainLookupData memory lookupData,
        bytes4 internalCallbackFunction
    ) internal view virtual returns (bytes memory) {}

    /// @dev Validates the response from the offchain lookup.
    function _validateLookupResponse(
        bytes4 validateLookupResponseFunction,
        bytes memory response
    ) private view {
        bool success = LowLevelCallUtils.functionStaticCall(
            address(this),
            abi.encodeWithSelector(validateLookupResponseFunction, response)
        );
        if (!success) LowLevelCallUtils.propagateRevert();
        return;
    }

    /// @dev Calls the internal callback function.
    /// Returned data is propagated directly, rather than being returned from this function.
    function _internalCallback(
        bytes4 callbackFunction,
        bytes memory response,
        bytes memory extraData
    ) private view {
        bool success = LowLevelCallUtils.functionStaticCall(
            address(this),
            abi.encodeWithSelector(callbackFunction, response, extraData)
        );
        if (!success) LowLevelCallUtils.propagateRevert();
        LowLevelCallUtils.propagateResult();
    }

    /// @dev Creates the extra data for the callback functions.
    function _createExtraData(
        address target,
        bytes4 internalCallbackFunction,
        bytes4 failureCallbackFunction,
        bytes4 externalCallbackFunction,
        bytes memory internalExtraData,
        bytes memory externalExtraData
    ) private pure returns (bytes memory) {
        uint256 targetAndCallbackFunctions = (uint256(
            uint32(externalCallbackFunction)
        ) << EXTERNAL_CALLBACK_FUNCTION_OFFSET) |
            (uint256(uint32(failureCallbackFunction)) <<
                FAILURE_CALLBACK_FUNCTION_OFFSET) |
            (uint256(uint32(internalCallbackFunction)) <<
                INTERNAL_CALLBACK_FUNCTION_OFFSET) |
            uint256(uint160(target));
        return
            abi.encode(
                targetAndCallbackFunctions,
                internalExtraData,
                externalExtraData
            );
    }

    /// @dev Decodes the extra data for the callback functions.
    function _getExtraData(
        bytes memory extraData
    )
        private
        pure
        returns (
            address target,
            bytes4 internalCallbackFunction,
            bytes4 failureCallbackFunction,
            bytes4 externalCallbackFunction,
            bytes memory internalExtraData,
            bytes memory externalExtraData
        )
    {
        uint256 targetAndCallbackFunctions;
        (targetAndCallbackFunctions, internalExtraData, externalExtraData) = abi
            .decode(extraData, (uint256, bytes, bytes));
        target = address(uint160(targetAndCallbackFunctions));
        internalCallbackFunction = bytes4(
            uint32(
                (targetAndCallbackFunctions >>
                    INTERNAL_CALLBACK_FUNCTION_OFFSET) & FUNCTIONS_MASK
            )
        );
        failureCallbackFunction = bytes4(
            uint32(
                (targetAndCallbackFunctions >>
                    FAILURE_CALLBACK_FUNCTION_OFFSET) & FUNCTIONS_MASK
            )
        );
        externalCallbackFunction = bytes4(
            uint32(
                (targetAndCallbackFunctions >>
                    EXTERNAL_CALLBACK_FUNCTION_OFFSET) & FUNCTIONS_MASK
            )
        );
        return (
            target,
            internalCallbackFunction,
            failureCallbackFunction,
            externalCallbackFunction,
            internalExtraData,
            externalExtraData
        );
    }
}
