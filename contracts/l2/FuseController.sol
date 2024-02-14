// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./L2Registry.sol";
import "./IFuseController.sol";
import "./IControllerUpgradeTarget.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error Unauthorised(bytes32 node, address addr);
error CannotUpgrade();
error nameExpired(bytes32 node);

/**
 * @dev A simple ENS registry controller. Names are permanently owned by a single account.
 *      Name data is structured as follows:
 *       - Byte 0: controller (address)
 *       - Byte 20: owner (address)
 *       - Byte 40: resolver (address)
 *       _ Byte 60: expiry (uint64)
 *       - Byte 68: fuses (uint64)
 *       - Byte 80: renewalController (address)
 */
contract FuseController is Ownable, IFuseController {
    L2Registry immutable registry;

    IControllerUpgradeTarget upgradeContract;

    // A struct to hold the unpacked data
    struct TokenData {
        address owner;
        address resolver;
        uint64 expiry;
        uint64 fuses;
        address renewalController;
    }

    constructor(L2Registry _registry) {
        registry = _registry;
    }

    /*************************
     * IController functions *
     *************************/

    function ownerOfWithData(
        bytes calldata tokenData
    ) external view returns (address) {
        (address owner, , , , ) = _unpack(tokenData);
        return owner;
    }

    function ownerOf(bytes32 node) external view returns (address) {
        //get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));
        (address owner, , , , ) = _unpack(tokenData);
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
        TokenData memory td;

        (
            td.owner,
            td.resolver,
            td.expiry,
            td.fuses,
            td.renewalController
        ) = _unpack(tokenData);

        require(value == 1);
        require(from == td.owner);
        require(operator == td.owner || operatorApproved);
        require(!_isExpired(tokenData));

        return
            _pack(
                address(this),
                to,
                td.resolver,
                td.expiry,
                td.fuses,
                td.renewalController
            );
    }

    function balanceOf(
        bytes calldata tokenData,
        address _owner,
        uint256 /*id*/
    ) external view returns (uint256) {
        (address owner, , , , ) = _unpack(tokenData);
        if (_isExpired(tokenData)) {
            return 0;
        }
        return _owner == owner ? 1 : 0;
    }

    function resolverFor(
        bytes calldata tokenData
    ) external view returns (address) {
        (, address resolver, , , ) = _unpack(tokenData);
        return resolver;
    }

    function expiryOf(bytes32 node) external view returns (uint64) {
        // get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));
        (, , uint64 expiry, , ) = _unpack(tokenData);
        return expiry;
    }

    function fusesOf(bytes32 node) external view returns (uint64) {
        // get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));
        (, , , uint64 fuses, ) = _unpack(tokenData);
        return fuses;
    }

    function renewalControllerOf(bytes32 node) external view returns (address) {
        // get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));
        (, , , , address renewalController) = _unpack(tokenData);
        return renewalController;
    }

    function upgrade(bytes32 node, bytes calldata extraData) public {
        // Make sure the upgrade contract is set.
        if (address(upgradeContract) == address(0)) {
            revert CannotUpgrade();
        }

        // Unpack the tokenData of the node.
        bytes memory tokenData = registry.getData(uint256(node));
        (
            address owner,
            address resolver,
            uint64 expiry,
            uint64 fuses,
            address renewalController
        ) = _unpack(tokenData);

        bool isAuthorized = registry.getAuthorization(
            uint256(node),
            owner,
            msg.sender
        );

        if (owner != msg.sender && !isAuthorized) {
            revert Unauthorised(node, msg.sender);
        }

        if (_isExpired(tokenData)) {
            revert nameExpired(node);
        }

        // Change the controller to the upgrade contract.
        registry.setNode(
            uint256(node),
            _pack(
                address(upgradeContract),
                owner,
                resolver,
                expiry,
                fuses,
                renewalController
            )
        );

        // Call the new contract to notify it of the upgrade.
        upgradeContract.upgradeFrom(node, extraData);
    }

    /*******************
     * Node Owner functions *
     *******************/

    function setResolver(uint256 id, address newResolver) external {
        // get tokenData
        bytes memory tokenData = registry.getData(id);
        (
            address owner,
            ,
            uint64 expiry,
            uint64 fuses,
            address renewalController
        ) = _unpack(tokenData);
        bool isAuthorized = registry.getAuthorization(id, owner, msg.sender);

        if (owner != msg.sender && !isAuthorized) {
            revert Unauthorised(bytes32(id), msg.sender);
        }

        registry.setNode(
            id,
            _pack(
                address(this),
                owner,
                newResolver,
                expiry,
                fuses,
                renewalController
            )
        );
    }

    function setSubnode(
        bytes32 node,
        uint256 label,
        address subnodeOwner,
        address subnodeResolver,
        uint64 subnodeExpiry,
        uint64 subnodeFuses,
        address subnodeRenewalController
    ) external {
        bytes memory tokenData = registry.getData(uint256(node));
        (address owner, , , , ) = _unpack(tokenData);
        bool isAuthorized = registry.getAuthorization(
            uint256(node),
            owner,
            msg.sender
        );

        if (owner != msg.sender && !isAuthorized) {
            revert Unauthorised(node, msg.sender);
        }

        registry.setSubnode(
            uint256(node),
            label,
            _pack(
                address(this),
                subnodeOwner,
                subnodeResolver,
                subnodeExpiry,
                subnodeFuses,
                subnodeRenewalController
            ),
            msg.sender,
            subnodeOwner
        );
    }

    /*******************
     * Owner only functions *
     *******************/

    // A function that sets the upgrade contract.
    function setUpgradeController(
        IControllerUpgradeTarget _upgradeContract
    ) external onlyOwner {
        upgradeContract = _upgradeContract;
    }

    /**********************
     * Internal functions *
     **********************/

    function _isExpired(bytes memory tokenData) internal view returns (bool) {
        (, , uint64 expiry, , ) = _unpack(tokenData);
        return expiry <= block.timestamp;
    }

    function _unpack(
        bytes memory tokenData
    )
        internal
        view
        returns (
            address owner,
            address resolver,
            uint64 expiry,
            uint64 fuses,
            address renewalController
        )
    {
        require(tokenData.length == 96, "Invalid tokenData length");

        assembly {
            owner := mload(add(tokenData, 40))
            resolver := mload(add(tokenData, 60))
            expiry := mload(add(tokenData, 68))
            fuses := mload(add(tokenData, 76))
            renewalController := mload(add(tokenData, 96))
        }
    }

    function _pack(
        address controller,
        address owner,
        address resolver,
        uint64 expiry,
        uint64 fuses,
        address renewalController
    ) internal view returns (bytes memory /*tokenData*/) {
        return
            abi.encodePacked(
                controller,
                owner,
                resolver,
                expiry,
                fuses,
                renewalController
            );
    }
}
