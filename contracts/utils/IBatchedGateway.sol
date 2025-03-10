// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @notice A HTTP error occurred on the batch gateway.
 */
error HttpError(uint16 status, string message);

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
