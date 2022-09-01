// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "./LowLevelCallUtils.sol";
import "./IOffchainMulticallable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

struct OffchainLookupCallData {
    string[] urls;
    address originalSender;
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
abstract contract OffchainMulticallable is ERC165, IOffchainMulticallable {
    function batchGatewayURLs() internal virtual view returns(string[] memory);

    function multicall(bytes[] memory data) public virtual returns (bytes[] memory results) {
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
                extraDatas[i].data = data[i];
                continue;
            }
            // Failure
            if(size >= 4) {
                bytes memory errorId = LowLevelCallUtils.readReturnData(0, 4);
                if(bytes4(errorId) == OffchainLookup.selector) {
                    // Offchain lookup. Decode the revert message and create our own that nests it.
                    bytes memory revertData = LowLevelCallUtils.readReturnData(4, size - 4);
                    (address sender, string[] memory urls, bytes memory callData, bytes4 innerCallbackFunction, bytes memory extraData) = abi.decode(revertData, (address,string[],bytes,bytes4,bytes));
                    // if(sender == address(this)) {
                        callDatas[offchainCount] = OffchainLookupCallData(urls, sender, callData);
                        extraDatas[i] = OffchainLookupExtraData(innerCallbackFunction, extraData);
                        offchainCount += 1;
                    // }
                    continue;
                }
            }

            // Unexpected response, revert the whole batch
            LowLevelCallUtils.propagateRevert();
        }
        if(offchainCount == 0) {
            return results;
        }
        // Trim callDatas if offchain data exists
        assembly {
            mstore(callDatas, offchainCount)
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
        bytes[] memory responses = abi.decode(response, (bytes[]));
        OffchainLookupExtraData[] memory extraDatas = abi.decode(extraData, (OffchainLookupExtraData[]));
        require(responses.length <= extraDatas.length);
        bytes[] memory data = new bytes[](extraDatas.length);
        uint256 j = 0;
        for(uint256 i = 0; i < extraDatas.length; i++) {
            if(extraDatas[i].callbackFunction == bytes32(0)) {
                // This call did not require an offchain lookup; use the previous input data.
                data[i] = extraDatas[i].data;
            } else {
                // Encode the callback as another multicall
                data[i] = abi.encodeWithSelector(
                    extraDatas[i].callbackFunction,
                    responses[j],
                    extraDatas[i].data
                );
                j = j + 1;
            }
        }
        return multicall(data);
    }

    function supportsInterface(bytes4 interfaceID) virtual override(ERC165) public view returns(bool) {
        return interfaceID == type(IOffchainMulticallable).interfaceId;
    }
}
