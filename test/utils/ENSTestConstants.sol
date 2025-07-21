// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title ENSTestConstants
 * @dev Generic constants for ENS test suite to avoid duplication
 * This ensures we use the actual contract values instead of duplicating them.
 */
library ENSTestConstants {
    // ============ Core ENS Constants ============

    // Zero/Root constants
    bytes32 constant ZERO_HASH = bytes32(0);
    bytes32 constant ROOT_NODE = bytes32(0);

    // ETH domain constants
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae; // keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL))

    // Reverse domain constants
    bytes32 constant REVERSE_LABEL = keccak256("reverse");
    bytes32 constant REVERSE_NODE =
        0xa097f6721ce401e757d1223a763fef49b8b5f90bb18567ddb86fd205dff71d34; // keccak256(abi.encodePacked(ROOT_NODE, REVERSE_LABEL))
    bytes32 constant ADDR_LABEL = keccak256("addr");
    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2; // keccak256(abi.encodePacked(REVERSE_NODE, ADDR_LABEL))

    // Other common TLDs
    bytes32 constant XYZ_LABEL = keccak256("xyz");
    bytes32 constant XYZ_NODE =
        0x9dd2c369a187b4e6b9c402f030e50743e619301ea62aa4c0737d4ef7e10a3d49; // keccak256(abi.encodePacked(ROOT_NODE, XYZ_LABEL))

    // ============ Time Constants ============

    uint256 constant SECOND = 1;
    uint256 constant MINUTE = 60 * SECOND;
    uint256 constant HOUR = 60 * MINUTE;
    uint256 constant DAY = 24 * HOUR;
    uint256 constant WEEK = 7 * DAY;
    uint256 constant MONTH = 30 * DAY;
    uint256 constant YEAR = 365 * DAY;

    // Registration specific times
    uint256 constant REGISTRATION_TIME = 28 * DAY;
    uint256 constant BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAY;

    // ============ Generic Constants ============

    uint64 constant MAX_EXPIRY = type(uint64).max;

    // Other common values
    uint256 constant MAX_UINT256 = type(uint256).max;
    uint64 constant MAX_UINT64 = type(uint64).max;

    // Price constants (commonly used in tests)
    uint256 constant BASE_PRICE = 5 * 10 ** 15; // 0.005 ETH
    uint256 constant PRICE_PREMIUM = 100 * 10 ** 18; // 100 ETH
}
