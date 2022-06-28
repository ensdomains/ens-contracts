// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "./LowLevelCallUtils.sol";
import "hardhat/console.sol";
error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

struct OffchainLookupCallData {
    string[] urls;
    bytes callData;
}

struct OffchainLookupExtraData {
    bytes4 callbackFunction;
    bytes data;
}

interface BatchGateway {
    function query(OffchainLookupCallData[] memory data) external returns(bytes[] memory responses);
}

/**
 * @dev Implements a multicall pattern that understands CCIP read.
 */
abstract contract OffchainMulticallable {
    function batchGatewayURLs() internal virtual view returns(string[] memory);

    function multicall(bytes[] memory data) public virtual returns (bytes[] memory results) {
        console.log("****multicall1");
        uint256 length = data.length;
        uint256 offchainCount = 0;
        OffchainLookupCallData[] memory callDatas = new OffchainLookupCallData[](length);
        OffchainLookupExtraData[] memory extraDatas = new OffchainLookupExtraData[](length);
        results = new bytes[](length);
        for(uint256 i = 0; i < length; i++) {
            bool result = LowLevelCallUtils.functionDelegateCall(address(this), data[i]);
            uint256 size = LowLevelCallUtils.returnDataSize();
            if(result) {
                results[i] = LowLevelCallUtils.readReturnData(0, size);
                console.log("****multicall5");
                console.logBytes(data[i]);
                console.log(size);
                console.logBytes(results[i]);
                extraDatas[i].data = data[i];
                continue;
            }
            // console.log("****multicall4");
            // Failure
            if(size >= 4) {
                // console.log("****multicall5");
                bytes memory errorId = LowLevelCallUtils.readReturnData(0, 4);
                if(bytes4(errorId) == OffchainLookup.selector) {
                    // Offchain lookup. Decode the revert message and create our own that nests it.
                    bytes memory revertData = LowLevelCallUtils.readReturnData(4, size - 4);
                    (address sender, string[] memory urls, bytes memory callData, bytes4 innerCallbackFunction, bytes memory extraData) = abi.decode(revertData, (address,string[],bytes,bytes4,bytes));
                    if(sender == address(this)) {
                        callDatas[offchainCount] = OffchainLookupCallData(urls, callData);
                        extraDatas[i] = OffchainLookupExtraData(innerCallbackFunction, extraData);
                        offchainCount += 1;
                    }
                    continue;
                }
            }

            // Unexpected response, revert the whole batch
            LowLevelCallUtils.propagateRevert();
        }
        assembly {
            mstore(callDatas, offchainCount)
        }
        console.log("offchain count");
        console.log(offchainCount);
        if(offchainCount == 0) {
            console.logBytes(results[0]);
            return results;
        }
        revert OffchainLookup(
            address(this),
            batchGatewayURLs(),
            abi.encodeCall(BatchGateway.query, callDatas),
            OffchainMulticallable.multicallCallback.selector,
            abi.encode(extraDatas)
        );
    }

    function multicallCallback(bytes calldata response, bytes calldata extraData) external virtual returns(bytes[] memory) {
        console.log("****multicallCallback1");
        bytes[] memory responses = abi.decode(response, (bytes[]));
        OffchainLookupExtraData[] memory extraDatas = abi.decode(extraData, (OffchainLookupExtraData[]));
        console.log(responses.length);
        console.log(extraDatas.length);
        require(responses.length <= extraDatas.length);
        bytes[] memory data = new bytes[](extraDatas.length);
        uint256 j = 0;
        for(uint256 i = 0; i < extraDatas.length; i++) {
            console.log("****multicallCallback2");
            console.log(i);
            console.logBytes32(extraDatas[i].callbackFunction);
            if(extraDatas[i].callbackFunction == bytes32(0)) {
                console.log("****multicallCallback3");
                // This call did not require an offchain lookup; use the previous input data.
                data[i] = extraDatas[i].data;
            } else {
                console.log("****multicallCallback4");
                console.log(i);
                console.log(j);
                console.logBytes(responses[j]);
                console.log("****multicallCallback4.1");
                console.logBytes(extraDatas[i].data);
                // Encode the callback as another multicall
                data[i] = abi.encodeWithSelector(
                    extraDatas[i].callbackFunction,
                    responses[j],
                    extraDatas[i].data
                );
                console.log("****multicallCallback4.2");
                console.logBytes(data[i]);
                j = j + 1;
            }
        }
        return multicall(data);
    }
}
