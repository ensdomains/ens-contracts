// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./IController.sol";
import "./IControllerUpgradeTarget.sol";

uint64 constant CAN_DO_EVERYTHING = 0;
uint64 constant CANNOT_BURN_NAME = 1;
uint64 constant CANNOT_BURN_FUSES = 2;
uint64 constant CANNOT_TRANSFER = 4;
uint64 constant CANNOT_SET_RESOLVER = 8;
uint64 constant CANNOT_CREATE_SUBDOMAIN = 16;
uint64 constant CANNOT_SET_RENEWAL_CONTROLLER = 32;
uint64 constant PARENT_CANNOT_SET_EXPIRY = 64;
uint64 constant PARENT_CANNOT_CONTROL = 128;

interface IFuseController is IController {
    function expiryOf(bytes32 node) external view returns (uint64);

    function fusesOf(bytes32 node) external view returns (uint64);

    function renewalControllerOf(bytes32 node) external view returns (address);

    function upgrade(bytes32 node, bytes calldata extraData) external;

    function setUpgradeController(
        IControllerUpgradeTarget _upgradeController
    ) external;
}
