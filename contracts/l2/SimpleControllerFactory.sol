// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./IControllerFactory.sol";
import "./L2Registry.sol";
import "./SimpleController.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "hardhat/console.sol";

contract SimpleControllerFactory is IControllerFactory {
    using Address for address;

    L2Registry immutable registry;

    event NewInstance(address owner, address instance);

    constructor(address _registry) {
        registry = L2Registry(_registry);
    }

    function computeAddress(
        address owner
    ) public view returns (address controller) {
        controller = Create2.computeAddress(
            bytes32(0),
            keccak256(
                abi.encodePacked(
                    type(SimpleController).creationCode,
                    abi.encode(address(registry), owner)
                )
            )
        );
    }

    function getInstance(address owner) external returns (address controller) {
        controller = computeAddress(owner);
        if (controller.code.length == 0) {
            controller = address(
                new SimpleController{salt: bytes32(0)}(registry, owner)
            );
        }
        emit NewInstance(owner, controller);
    }
}
