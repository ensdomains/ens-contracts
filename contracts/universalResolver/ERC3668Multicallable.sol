// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";
import {IMulticallGateway} from "./IMulticallGateway.sol";
import {ERC3668Utils, OffchainLookup, OffchainLookupData} from "../utils/ERC3668Utils.sol";

abstract contract ERC3668Multicallable {
    /// @notice The ERC3668 sender does not match the address of the calling contract.
    error LookupSenderNotThis();

    /// @dev The result of a call.
    struct InternalResult {
        /// @dev Whether the call is offchain.
        bool offchain;
        /// @dev The result of the call.
        ///      If offchain, this is encoded as `(bytes callData, (bytes4 callbackFunction, bytes extraData))`
        ///      based on data from the lookup.
        bytes data;
    }

    /// @notice Makes an ERC3668-compatible multicall.
    /// @param data The array of calls to make.
    /// @param urls The array of URLs to use in the lookup.
    /// @return results The resolved results.
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

    /// @notice The ERC3668 callback function.
    /// @param response The response from the ERC3668 call - an array of results from the gateway.
    /// @param extraData The passthrough data from `multicall` - an array of `InternalResult` structs, and the original `urls` array.
    /// @return results The resolved results.
    function multicallCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes[] memory) {
        bytes[] memory results = abi.decode(response, (bytes[]));
        (InternalResult[] memory internalResults, string[] memory urls) = abi
            .decode(extraData, (InternalResult[], string[]));
        uint256 existingOffchainCount = 0;
        uint256 newOffchainCount = 0;
        for (uint256 i = 0; i < internalResults.length; i++) {
            if (!internalResults[i].offchain) continue;
            // based on encoding in `callWithInternalResult`
            (bytes4 callbackFunction, bytes memory wrappedExtraData) = abi
                .decode(internalResults[i].data, (bytes4, bytes));
            bytes memory callData = abi.encodeWithSelector(
                callbackFunction,
                results[existingOffchainCount],
                wrappedExtraData
            );
            internalResults[i] = callWithInternalResult(
                address(this),
                callData
            );
            existingOffchainCount += 1;
            if (internalResults[i].offchain) newOffchainCount += 1;
        }

        return _getResults(internalResults, newOffchainCount, urls);
    }

    /// @dev Gets the results from the multicall.
    function _getResults(
        InternalResult[] memory internalResults,
        uint256 offchainCount,
        string[] memory urls
    ) private view returns (bytes[] memory) {
        if (offchainCount != 0) {
            bytes[] memory offchainCallDatas = new bytes[](offchainCount);
            uint256 offchainIndex = 0;
            for (uint256 i = 0; i < internalResults.length; i++) {
                if (!internalResults[i].offchain) continue;
                // based on encoding in `callWithInternalResult`
                (bytes memory callData, bytes memory extraData) = abi.decode(
                    internalResults[i].data,
                    (bytes, bytes)
                );
                offchainCallDatas[offchainIndex] = callData;
                internalResults[i].data = extraData;
                offchainIndex += 1;
            }

            revert OffchainLookup(
                address(this),
                urls,
                abi.encodeCall(
                    IMulticallGateway.multicall,
                    offchainCallDatas
                ),
                this.multicallCallback.selector,
                abi.encode(internalResults, urls)
            );
        }

        bytes[] memory results = new bytes[](internalResults.length);
        for (uint256 i = 0; i < internalResults.length; i++) {
            results[i] = internalResults[i].data;
        }

        return results;
    }

    /// @dev Makes an ERC3668-compatible call and returns the result.
    ///      Data from an offchain lookup is encoded as `(bytes callData, (bytes4 callbackFunction, bytes extraData))`.
    function callWithInternalResult(
        address target,
        bytes memory data
    ) private view returns (InternalResult memory result) {
        (bool success, bytes4 errorId, bytes memory returnData) = ERC3668Utils
            .callWithNormalisedResult(target, data);

        if (success) {
            result.data = returnData;
            result.offchain = false;
            return result;
        }

        if (!ERC3668Utils.isOffchainLookupError(errorId)) {
            result.offchain = false;
            if (errorId == bytes4(0) && returnData.length == 0) return result;
            result.data = bytes.concat(errorId, returnData);
            return result;
        }

        OffchainLookupData memory caughtLookup = ERC3668Utils
            .getOffchainLookupData(returnData);

        if (caughtLookup.sender != address(this)) revert LookupSenderNotThis();

        result.offchain = true;
        result.data = abi.encode(
            caughtLookup.callData,
            abi.encode(caughtLookup.callbackFunction, caughtLookup.extraData)
        );
        return result;
    }
}
