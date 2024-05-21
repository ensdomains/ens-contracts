//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IETHRegistrarController} from "../IETHRegistrarController.sol";
import {IBaseRegistrar} from "../IBaseRegistrar.sol";

error NameHasPremium(string name);

abstract contract BulkRenewalBase is ERC165 {
    IBaseRegistrar immutable base;
    IETHRegistrarController immutable controller;

    constructor(IBaseRegistrar _base, IETHRegistrarController _controller) {
        base = _base;
        controller = _controller;
    }
}
