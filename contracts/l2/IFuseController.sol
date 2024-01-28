// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./IController.sol";
import "./IControllerUpgrade.sol";

interface IFuseController is IController {
    function expiryOf(bytes32 node) external view returns (uint64);

    function fusesOf(bytes32 node) external view returns (uint96);

    function renewalControllerOf(bytes32 node) external view returns (address);

    function upgrade(bytes32 node, bytes calldata extraData) external;

    function setUpgradeController(
        IControllerUpgrade _upgradeController
    ) external;
}
