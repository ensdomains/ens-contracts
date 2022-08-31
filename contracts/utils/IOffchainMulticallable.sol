// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IOffchainMulticallable {
    function multicall(bytes[] calldata data) external returns(bytes[] memory results);
}
