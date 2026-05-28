// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

contract Multicall3 {
    struct Call { address target; bytes callData; }
    struct Call3 { address target; bool allowFailure; bytes callData; }
    struct Result { bool success; bytes returnData; }

    function aggregate3(Call3[] calldata calls) public payable returns (Result[] memory returnData) {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length;) {
            Call3 calldata c = calls[i];
            (bool success, bytes memory ret) = c.target.call(c.callData);
            if (!success && !c.allowFailure) {
                assembly { revert(add(ret, 0x20), mload(ret)) }
            }
            returnData[i] = Result(success, ret);
            unchecked { i++; }
        }
    }

    function tryAggregate(bool requireSuccess, Call[] calldata calls) public payable returns (Result[] memory returnData) {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length;) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if (requireSuccess && !success) {
                assembly { revert(add(ret, 0x20), mload(ret)) }
            }
            returnData[i] = Result(success, ret);
            unchecked { i++; }
        }
    }

    function getCurrentBlockTimestamp() public view returns (uint256) { return block.timestamp; }
    function getEthBalance(address addr) public view returns (uint256) { return addr.balance; }
    function getBlockNumber() public view returns (uint256) { return block.number; }
    function getChainId() public view returns (uint256) { return block.chainid; }
}
