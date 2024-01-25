// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./L2Registry.sol";
import "./IController.sol";

/**
 * @dev A simple ENS registry controller. Names are permanently owned by a single account.
 *      Name data is structured as follows:
 *       - Byte 0: controller (address)
 *       - Byte 20: owner (address)
 *       - Byte 40: resolver (address)
 *       _ Byte 60: expiry (uint64)
 *       - Byte 68: fuses (uint96)
 *       - Byte 80: renewalController (address)
 */
contract SimpleController is IController {
    L2Registry immutable registry;

    constructor(L2Registry _registry) {
        registry = _registry;
    }

    /*************************
     * IController functions *
     *************************/
    function ownerOf(bytes calldata tokenData) external pure returns (address) {
        (address owner, ) = _unpack(tokenData);
        return owner;
    }

    function safeTransferFrom(
        bytes calldata tokenData,
        address operator,
        address from,
        address to,
        uint256 /*id*/,
        uint256 value,
        bytes calldata /*data*/,
        bool operatorApproved
    ) external view returns (bytes memory) {
        (address owner, address resolver) = _unpack(tokenData);

        require(value == 1);
        require(from == owner);
        require(operator == owner || operatorApproved);

        return _pack(to, resolver);
    }

    function balanceOf(
        bytes calldata tokenData,
        address _owner,
        uint256 /*id*/
    ) external pure returns (uint256) {
        (address owner, ) = _unpack(tokenData);
        return _owner == owner ? 1 : 0;
    }

    function resolverFor(
        bytes calldata tokenData
    ) external pure returns (address) {
        (, address resolver) = _unpack(tokenData);
        return resolver;
    }

    /*******************
     * Owner functions *
     *******************/

    function setResolver(uint256 id, address newResolver) external {
        // get tokenData
        bytes memory tokenData = registry.getData(id);
        (address owner, ) = _unpack(tokenData);
        bool isAuthorized = registry.getAuthorization(id, owner, msg.sender);
        require(owner == msg.sender || isAuthorized);
        registry.setNode(id, _pack(owner, newResolver));
    }

    function setSubnode(
        bytes32 node,
        uint256 label,
        address subnodeOwner,
        address subnodeResolver
    ) external {
        bytes memory tokenData = registry.getData(uint256(node));
        (address owner, ) = _unpack(tokenData);
        bool isAuthorized = registry.getAuthorization(
            uint256(node),
            owner,
            msg.sender
        );
        require(owner == msg.sender || isAuthorized);
        registry.setSubnode(
            uint256(node),
            label,
            _pack(subnodeOwner, subnodeResolver),
            msg.sender,
            subnodeOwner
        );
    }

    function _unpack(
        bytes memory tokenData
    ) internal pure returns (address owner, address resolver) {
        assembly {
            owner := mload(add(tokenData, 40))
            resolver := mload(add(tokenData, 60))
        }
    }

    function _getExpiryAndFuses(
        bytes memory tokenData
    ) internal pure returns (uint64 expiry, uint96 fuses) {
        assembly {
            expiry := mload(add(tokenData, 68))
            fuses := mload(add(tokenData, 80))
        }
    }

    function _pack(
        address owner,
        address resolver
    ) internal view returns (bytes memory tokenData) {
        tokenData = abi.encodePacked(address(this), owner, resolver);
    }
}
