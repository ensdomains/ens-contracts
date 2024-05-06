// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {LowLevelCallUtils} from "./LowLevelCallUtils.sol";
import {ERC3668Utils, OffchainLookupData} from "./ERC3668Utils.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

struct Result {
    bytes data;
    bool success;
}

struct InternalResult {
    bool offchain;
    bool success;
    bytes returnData;
    bytes extraData;
}

interface MulticallableGateway {
    function multicall(
        bytes[] calldata data
    ) external returns (bytes[] memory results);
}

abstract contract ERC3668Multicallable {
    function multicallCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes[] memory) {
        bytes[] memory results = abi.decode(response, (bytes[]));
        (InternalResult[] memory internalResults, string[] memory urls) = abi
            .decode(extraData, (InternalResult[], string[]));
        uint256 offchainCount = 0;

        for (uint256 i = 0; i < internalResults.length; i++) {
            if (!internalResults[i].offchain) continue;
            (bytes4 callbackFunction, bytes memory wrappedExtraData) = abi
                .decode(internalResults[i].extraData, (bytes4, bytes));
            bytes memory callData = abi.encodeWithSelector(
                callbackFunction,
                results[offchainCount],
                wrappedExtraData
            );
            internalResults[i] = callWithInternalResult(
                address(this),
                callData
            );
            if (internalResults[i].offchain) offchainCount += 1;
        }

        return _getResults(internalResults, offchainCount, urls);
    }

    function multicall(
        bytes[] calldata data,
        string[] calldata urls
    ) external view returns (bytes[] memory) {
        InternalResult[] memory internalResults = new InternalResult[](
            data.length
        );
        uint256 offchainCount = 0;

        for (uint256 i = 0; i < data.length; i++) {
            internalResults[i] = callWithInternalResult(address(this), data[i]);
            if (internalResults[i].offchain) offchainCount += 1;
        }

        return _getResults(internalResults, offchainCount, urls);
    }

    function _getResults(
        InternalResult[] memory internalResults,
        uint256 offchainCount,
        string[] memory urls
    ) internal view returns (bytes[] memory) {
        if (offchainCount != 0) {
            bytes[] memory offchainCallDatas = new bytes[](offchainCount);
            uint256 offchainIndex = 0;
            for (uint256 i = 0; i < internalResults.length; i++) {
                if (!internalResults[i].offchain) continue;
                offchainCallDatas[offchainIndex] = internalResults[i]
                    .returnData;
                internalResults[i].returnData = "";
                offchainIndex += 1;
            }

            revert OffchainLookup(
                address(this),
                urls,
                abi.encodeCall(
                    MulticallableGateway.multicall,
                    offchainCallDatas
                ),
                this.multicallCallback.selector,
                abi.encode(internalResults, urls)
            );
        }

        bytes[] memory results = new bytes[](internalResults.length);
        for (uint256 i = 0; i < internalResults.length; i++) {
            results[i] = internalResults[i].returnData;
        }

        return results;
    }

    function callWithInternalResult(
        address target,
        bytes memory data
    ) internal view returns (InternalResult memory result) {
        bytes4 errorId;
        (result.success, errorId, result.returnData) = ERC3668Utils
            .callWithNormalisedResult(target, data);

        if (result.success) {
            return result;
        }

        if (errorId != OffchainLookup.selector) {
            result.returnData = errorId == bytes4(0) &&
                result.returnData.length == 0
                ? bytes("")
                : bytes.concat(errorId, result.returnData);
            return result;
        }

        OffchainLookupData memory caughtLookup = ERC3668Utils
            .getOffchainLookupData(result.returnData);

        require(
            caughtLookup.sender == address(this),
            "ERC3668Multicallable: invalid sender"
        );

        result.offchain = true;
        result.returnData = caughtLookup.callData;
        result.extraData = abi.encode(
            caughtLookup.callbackFunction,
            caughtLookup.extraData
        );
        return result;
    }
}
