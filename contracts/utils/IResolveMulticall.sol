// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev EIP-3668 encoding for resolve(multicall)
interface IResolveMulticall {
    function multicall(bytes[] calldata) external view returns (bytes[] memory);
}
