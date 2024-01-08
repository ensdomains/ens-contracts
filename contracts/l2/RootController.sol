// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./IControllerFactory.sol";
import "./RootController.sol";
import "./IControllerFactory.sol";
import "./IController.sol";
import "./L2Registry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RootController is Ownable, IController {
    address resolver;

    constructor(address initialOwner, address _resolver) Ownable() {
        resolver = _resolver;
    }

    error CannotTransfer();

    function ownerOf(
        bytes calldata /*tokenData*/
    ) external view returns (address) {
        return owner();
    }

    function safeTransferFrom(
        bytes calldata /*tokenData*/,
        address /*sender*/,
        address /*from*/,
        address /*to*/,
        uint256 /*id*/,
        uint256 /*value*/,
        bytes calldata /*data*/
    ) external returns (bytes memory) {
        revert CannotTransfer();
    }

    function balanceOf(
        bytes calldata /*tokenData*/,
        address _owner,
        uint256 /*id*/
    ) external view returns (uint256) {
        return _owner == owner() ? 1 : 0;
    }

    function resolverFor(
        bytes calldata /*tokenData*/
    ) external view returns (address) {
        return resolver;
    }

    function setResolver(address newResolver) external onlyOwner {
        resolver = newResolver;
    }

    function setSubnode(
        L2Registry registry,
        uint256 node,
        uint256 label,
        bytes memory subnodeData
    ) external onlyOwner {
        registry.setSubnode(node, label, subnodeData, msg.sender, address(0));
    }
}
