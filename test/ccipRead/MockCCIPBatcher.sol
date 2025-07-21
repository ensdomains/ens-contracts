// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {CCIPBatcher, CCIPReader} from "../../contracts/ccipRead/CCIPBatcher.sol";

/**
 * @title MockCCIPBatcher
 * @dev Concrete implementation of CCIPBatcher for testing purposes
 */
contract MockCCIPBatcher is CCIPBatcher {
    constructor() CCIPReader(50000) {}

    // Add any additional testing functionality if needed
}
