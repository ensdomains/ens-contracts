// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IVersionableResolver {
    event RecordVersionChanged(bytes32 indexed node, uint64 clearIndex);

    function recordVersion(bytes32 node) external view returns (uint64);
}
