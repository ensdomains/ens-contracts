// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./L2Registry.sol";
import "./IController.sol";
import "./IControllerFactory.sol";
import "hardhat/console.sol";

contract SimpleController is IController {
    L2Registry immutable registry;
    IControllerFactory immutable factory;
    address immutable owner;

    address resolver;

    constructor(L2Registry _registry, address _owner) {
        registry = _registry;
        factory = IControllerFactory(msg.sender);
        owner = _owner;
    }

    function ownerOf(
        bytes calldata /* tokenData */
    ) external view returns (address) {
        return owner;
    }

    function safeTransferFrom(
        bytes calldata /*tokenData*/,
        address /*operator*/,
        address from,
        address to,
        uint256 /*id*/,
        uint256 value,
        bytes calldata /*data*/
    ) external returns (bytes memory) {
        require(msg.sender == address(registry));
        require(value == 1);
        require(from == owner);
        address newController = factory.getInstance(to);
        return abi.encodePacked(newController);
    }

    function balanceOf(
        bytes calldata /*tokenData*/,
        address _owner,
        uint256 /*id*/
    ) external view returns (uint256) {
        return _owner == owner ? 1 : 0;
    }

    function resolverFor(
        bytes calldata /* tokenData */
    ) external view returns (address) {
        return resolver;
    }

    function setResolver(address _resolver) external {
        require(
            msg.sender == owner || registry.isApprovedForAll(owner, msg.sender)
        );
        resolver = _resolver;
    }

    function setSubnode(
        uint256 node,
        uint256 label,
        address subnodeOwner
    ) external {
        console.log("Calling SimpleController.setSubnode");
        console.log(msg.sender);
        console.log(owner);
        require(
            msg.sender == owner || registry.isApprovedForAll(owner, msg.sender)
        );
        console.log("1");
        console.log(subnodeOwner);
        address newController = factory.getInstance(subnodeOwner);
        console.log("2");
        registry.setSubnode(
            node,
            label,
            abi.encodePacked(newController),
            msg.sender,
            subnodeOwner
        );
        console.log("3");
        console.log(node);
        console.log(label);
        console.log(subnodeOwner);
        console.log(newController);
    }
}
