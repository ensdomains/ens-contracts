// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct Thread {
	address target;
	bytes call;
	bytes data;
	uint256 bits;
}
library ThreadBits {
	uint256 constant OFFCHAIN = 1 << 0;
	uint256 constant CALL_ERROR = 1 << 1; 
	uint256 constant OFFCHAIN_ERROR = 1 << 2; 
	uint256 constant EMPTY_RESPONSE = 1 << 3;
	uint256 constant DONE = 1 << 4;
	uint256 constant ERROR_MASK = CALL_ERROR | OFFCHAIN_ERROR | EMPTY_RESPONSE;
}

interface IBatchcall {
    error LengthMismatch();
    error EmptyResponse(bytes4 selector);

    function batch(
        Thread[] calldata threads,
        string[] memory gateways
    ) external view returns (Thread[] memory);
}
