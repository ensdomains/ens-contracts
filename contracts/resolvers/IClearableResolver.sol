// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IClearableResolver {
    event RecordsCleared(bytes32 indexed node, uint64 clearIndex);

    function clearIndex(bytes32 node) external view returns (uint64);
}
