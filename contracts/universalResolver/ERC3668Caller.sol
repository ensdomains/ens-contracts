// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";
import {ERC3668Utils, OffchainLookup, OffchainLookupData} from "../utils/ERC3668Utils.sol";

error LookupSenderMismatched();

error HttpError(uint16 status, string message);

// User callback functions are encoded as a single bytes32 value
// The first 4 bytes are the internal callback function
// The next 4 bytes are the calldata rewrite function
// The next 4 bytes are the failure callback function
// The next 4 bytes are the validate response function
// The next 4 bytes are the external callback function
// The remaining 12 bytes are unused
uint16 constant INTERNAL_CALLBACK_FUNCTION_OFFSET = 0;
uint16 constant CALLDATA_REWRITE_FUNCTION_OFFSET = 32;
uint16 constant FAILURE_CALLBACK_FUNCTION_OFFSET = 64;
uint16 constant VALIDATE_RESPONSE_FUNCTION_OFFSET = 96;
uint16 constant EXTERNAL_CALLBACK_FUNCTION_OFFSET = 128;
uint32 constant FUNCTIONS_MASK = 0xffffffff;

abstract contract ERC3668Caller {
    function callback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        (
            address target,
            uint256 callbackFunctions,
            bytes memory internalExtraData,
            bytes memory externalExtraData
        ) = _getExtraData(extraData);

        bytes4 validateResponseFunction = bytes4(
            uint32(
                (callbackFunctions >> VALIDATE_RESPONSE_FUNCTION_OFFSET) &
                    FUNCTIONS_MASK
            )
        );
        if (validateResponseFunction != bytes4(0))
            _validateResponse(validateResponseFunction, response);

        bytes4 externalCallbackFunction = bytes4(
            uint32(
                (callbackFunctions >> EXTERNAL_CALLBACK_FUNCTION_OFFSET) &
                    FUNCTIONS_MASK
            )
        );
        return
            call(
                target,
                0,
                bytes.concat(
                    externalCallbackFunction,
                    abi.encode(response, externalExtraData)
                ),
                internalExtraData,
                uint128(callbackFunctions)
            );
    }

    function call(
        address target,
        uint256 gas,
        bytes memory data,
        bytes memory internalExtraData,
        uint128 userCallbackFunctions
    ) internal view returns (bytes memory) {
        (bool success, bytes4 errorId, bytes memory result) = ERC3668Utils
            .callWithNormalisedResult(target, data, gas);

        if (success) {
            bytes4 internalCallbackFunction = bytes4(
                uint32(
                    (userCallbackFunctions >>
                        INTERNAL_CALLBACK_FUNCTION_OFFSET) & FUNCTIONS_MASK
                )
            );
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
                userCallbackFunctions,
                lookupData.callbackFunction,
                internalExtraData,
                lookupData.extraData
            );

            bytes4 calldataRewriteFunction = bytes4(
                uint32(
                    (userCallbackFunctions >>
                        CALLDATA_REWRITE_FUNCTION_OFFSET) & FUNCTIONS_MASK
                )
            );
            if (calldataRewriteFunction != bytes4(0)) {
                lookupData.callData = abi.decode(
                    _formatCalldata(calldataRewriteFunction, lookupData),
                    (bytes)
                );
            }

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

        bytes4 failureCallbackFunction = bytes4(
            uint32(
                (userCallbackFunctions >> FAILURE_CALLBACK_FUNCTION_OFFSET) &
                    FUNCTIONS_MASK
            )
        );
        if (failureCallbackFunction != bytes4(0)) {
            _internalCallback(
                failureCallbackFunction,
                errorData,
                internalExtraData
            );
        }

        LowLevelCallUtils.propagateRevert(errorData);
    }

    function createUserCallbackFunctions(
        bytes4 internalCallbackFunction,
        bytes4 calldataRewriteFunction,
        bytes4 failureCallbackFunction,
        bytes4 validateResponseFunction
    ) internal pure returns (uint128) {
        return
            (uint128(uint32(validateResponseFunction)) <<
                VALIDATE_RESPONSE_FUNCTION_OFFSET) |
            (uint128(uint32(failureCallbackFunction)) <<
                FAILURE_CALLBACK_FUNCTION_OFFSET) |
            (uint128(uint32(calldataRewriteFunction)) <<
                CALLDATA_REWRITE_FUNCTION_OFFSET) |
            uint128(uint32(internalCallbackFunction));
    }

    function _formatCalldata(
        bytes4 calldataRewriteFunction,
        OffchainLookupData memory data
    ) private view returns (bytes memory) {
        bool success = LowLevelCallUtils.functionStaticCall(
            address(this),
            abi.encodeWithSelector(calldataRewriteFunction, data)
        );

        if (!success) LowLevelCallUtils.propagateRevert();
        return
            LowLevelCallUtils.readReturnData(
                0,
                LowLevelCallUtils.returnDataSize()
            );
    }

    function _validateResponse(
        bytes4 validateResponseFunction,
        bytes memory response
    ) private view {
        bool success = LowLevelCallUtils.functionStaticCall(
            address(this),
            abi.encodeWithSelector(validateResponseFunction, response)
        );
        if (!success) LowLevelCallUtils.propagateRevert();
        return;
    }

    function _internalCallback(
        bytes4 callbackFunction,
        bytes memory response,
        bytes memory extraData
    ) private view returns (bytes memory) {
        bool success = LowLevelCallUtils.functionStaticCall(
            address(this),
            abi.encodeWithSelector(callbackFunction, response, extraData)
        );
        if (!success) LowLevelCallUtils.propagateRevert();
        LowLevelCallUtils.propagateResult();
    }

    function _createExtraData(
        address target,
        uint128 userCallbackFunctions,
        bytes4 externalCallbackFunction,
        bytes memory internalExtraData,
        bytes memory externalExtraData
    ) private view returns (bytes memory) {
        uint256 callbackFunctions = uint256(userCallbackFunctions) |
            (uint256(uint32(externalCallbackFunction)) << 128);
        return
            abi.encode(
                target,
                callbackFunctions,
                internalExtraData,
                externalExtraData
            );
    }

    function _getExtraData(
        bytes memory extraData
    )
        private
        pure
        returns (
            address target,
            uint256 callbackFunctions,
            bytes memory internalExtraData,
            bytes memory externalExtraData
        )
    {
        return abi.decode(extraData, (address, uint256, bytes, bytes));
    }
}
