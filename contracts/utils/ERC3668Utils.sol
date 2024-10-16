// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {LowLevelCallUtils} from "./LowLevelCallUtils.sol";

struct OffchainLookupData {
    address sender;
    string[] urls;
    bytes callData;
    bytes4 callbackFunction;
    bytes extraData;
}

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

library ERC3668Utils {
    function callWithNormalisedResult(
        address target,
        bytes memory data
    )
        internal
        view
        returns (bool success, bytes4 errorId, bytes memory result)
    {
        return callWithNormalisedResult(target, data, 0);
    }

    function assertCallWithNormalisedResult(
        address target,
        bytes memory data
    ) internal view returns (bytes memory) {
        (
            bool success,
            bytes4 errorId,
            bytes memory result
        ) = callWithNormalisedResult(target, data, 0);
        if (!success)
            LowLevelCallUtils.propagateRevert(bytes.concat(errorId, result));
        return result;
    }

    function callWithNormalisedResult(
        address target,
        bytes memory data,
        uint256 gas
    )
        internal
        view
        returns (bool success, bytes4 errorId, bytes memory result)
    {
        success = gas == 0
            ? LowLevelCallUtils.functionStaticCall(target, data)
            : LowLevelCallUtils.functionStaticCall(target, data, gas);
        uint256 size = LowLevelCallUtils.returnDataSize();

        if (success)
            return (
                success,
                errorId,
                LowLevelCallUtils.readReturnData(0, size)
            );

        if (size < 4)
            return (
                false,
                bytes4(0),
                LowLevelCallUtils.readReturnData(0, size)
            );

        errorId = bytes4(LowLevelCallUtils.readReturnData(0, 4));
        return (
            success,
            errorId,
            LowLevelCallUtils.readReturnData(4, size - 4)
        );
    }

    function getOffchainLookupData(
        bytes memory data
    ) internal pure returns (OffchainLookupData memory result) {
        (
            result.sender,
            result.urls,
            result.callData,
            result.callbackFunction,
            result.extraData
        ) = abi.decode(data, (address, string[], bytes, bytes4, bytes));
        return result;
    }

    function isOffchainLookupError(
        bytes4 errorId
    ) internal pure returns (bool) {
        return errorId == OffchainLookup.selector;
    }
}
