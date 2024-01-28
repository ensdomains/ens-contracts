// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./IController.sol";

interface IFuseController is IController {
    function expiryOf(bytes32 node) external view returns (uint64);

    function fusesOf(bytes32 node) external view returns (uint96);

    function renewalControllerOf(bytes32 node) external view returns (address);
}
