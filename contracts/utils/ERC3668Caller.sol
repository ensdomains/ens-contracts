// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {LowLevelCallUtils} from "./LowLevelCallUtils.sol";
import {ERC3668Utils, OffchainLookup, OffchainLookupData} from "./ERC3668Utils.sol";

error LookupSenderMismatched();

abstract contract ERC3668Caller {
    function callback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        (
            address target,
            bytes4 internalCallbackFunction,
            bytes4 externalCallbackFunction,
            bytes4 calldataRewriteFunction,
            bytes memory internalExtraData,
            bytes memory externalExtraData
        ) = _getExtraData(extraData);
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
                calldataRewriteFunction
            );
    }

    function call(
        address target,
        uint256 gas,
        bytes memory data,
        bytes memory internalExtraData,
        bytes4 internalCallbackFunction
    ) internal view returns (bytes memory) {
        return
            call(
                target,
                gas,
                data,
                internalExtraData,
                internalCallbackFunction,
                bytes4(0)
            );
    }

    function call(
        address target,
        uint256 gas,
        bytes memory data,
        bytes memory internalExtraData,
        bytes4 internalCallbackFunction,
        bytes4 calldataRewriteFunction
    ) internal view returns (bytes memory) {
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
                lookupData.callbackFunction,
                calldataRewriteFunction,
                internalExtraData,
                lookupData.extraData
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

        if (errorId == bytes4(0) && result.length == 0)
            LowLevelCallUtils.propagateRevert("");

        LowLevelCallUtils.propagateRevert(bytes.concat(errorId, result));
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
        bytes4 internalCallbackFunction,
        bytes4 externalCallbackFunction,
        bytes4 calldataRewriteFunction,
        bytes memory internalExtraData,
        bytes memory externalExtraData
    ) private pure returns (bytes memory) {
        return
            abi.encode(
                target,
                internalCallbackFunction,
                externalCallbackFunction,
                calldataRewriteFunction,
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
            bytes4 internalCallbackFunction,
            bytes4 externalCallbackFunction,
            bytes4 calldataRewriteFunction,
            bytes memory internalExtraData,
            bytes memory externalExtraData
        )
    {
        return
            abi.decode(
                extraData,
                (address, bytes4, bytes4, bytes4, bytes, bytes)
            );
    }
}
