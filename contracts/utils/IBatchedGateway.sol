// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct BatchedGatewayQuery {
    address target;
    string[] urls;
    bytes data;
}

interface IBatchedGateway {
    function query(
        BatchedGatewayQuery[] memory
    ) external view returns (bool[] memory failures, bytes[] memory responses);
}
