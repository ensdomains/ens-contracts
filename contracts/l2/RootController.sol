// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./RootController.sol";
import "./IController.sol";
import "./L2Registry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RootController is Ownable, IController {
    address resolver;

    bytes32 private constant ROOT_NODE =
        0x0000000000000000000000000000000000000000000000000000000000000000;

    constructor(address _resolver) Ownable() {
        resolver = _resolver;
    }

    error CannotTransfer();

    event NewResolver(uint256 id, address resolver);

    /*************************
     * IController functions *
     *************************/
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
        bytes calldata /*data*/,
        bool /*operatorApproved*/
    ) external pure returns (bytes memory) {
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

    /*******************
     * Owner functions *
     *******************/
    function setResolver(address newResolver) external onlyOwner {
        resolver = newResolver;
        emit NewResolver(0, newResolver);
    }

    function setSubnode(
        L2Registry registry,
        uint256 /*node*/,
        uint256 label,
        bytes memory subnodeData
    ) external onlyOwner {
        registry.setSubnode(
            uint256(ROOT_NODE),
            label,
            subnodeData,
            msg.sender,
            address(0)
        );
    }
}
