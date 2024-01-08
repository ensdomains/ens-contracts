// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IControllerFactory {
    function getInstance(address owner) external returns (address controller);
}
