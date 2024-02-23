// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "./L2Registry.sol";
import "./IFuseController.sol";
import "./IControllerUpgradeTarget.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

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
        (bool isExpired, address owner, , , , ) = _isExpired(tokenData);

        if (isExpired) {
            return address(0);
        }
        return owner;
    }

    function ownerOf(bytes32 node) external view returns (address) {
        //get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));

        (bool isExpired, address owner, , , , ) = _isExpired(tokenData);

        if (isExpired) {
            return address(0);
        }

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

        // Make sure the tokenData is of the correct length.
        if (tokenData.length < 96) {
            revert("Invalid tokenData length");
        }

        (
            td.owner,
            td.resolver,
            td.expiry,
            td.fuses,
            td.renewalController
        ) = _unpack(tokenData);

        require(msg.sender == address(registry), "Caller is not the registry");
        require(value == 1);
        require(from == td.owner, "From is not the owner");
        require(
            operator == td.owner || operatorApproved,
            "Operator not approved"
        );
        (bool isExpired, , , , , ) = _isExpired(tokenData);
        require(!isExpired, "Token is expired");

        // Make sure the CANNOT_TRANSFER fuse is not burned.
        require((td.fuses & CANNOT_TRANSFER) == 0, "Cannot transfer");

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

    function burn(
        bytes calldata tokenData,
        address operator,
        address from,
        uint256 /*id*/,
        uint256 value,
        bytes calldata /*data*/,
        bool operatorApproved
    ) external view returns (bytes memory) {
        TokenData memory td;

        // Make sure the tokenData is of the correct length.
        if (tokenData.length < 96) {
            revert("Invalid tokenData length");
        }

        (
            td.owner,
            td.resolver,
            td.expiry,
            td.fuses,
            td.renewalController
        ) = _unpack(tokenData);

        require(msg.sender == address(registry), "Caller is not the registry");
        require(value == 1);
        require(from == td.owner, "From is not the owner");
        require(
            operator == td.owner || operatorApproved,
            "Operator not approved"
        );
        (bool isExpired, , , , , ) = _isExpired(tokenData);
        require(!isExpired, "Token is expired");

        // Make sure the CANNOT_BURN_NAME and CANNOT_TRANSFER fuse is not burned.
        require(
            (td.fuses & (CANNOT_BURN_NAME | CANNOT_TRANSFER)) == 0,
            "Cannot burn or transfer"
        );

        return _pack(address(this), address(0), address(0), 0, 0, address(0));
    }

    function balanceOf(
        bytes calldata tokenData,
        address _owner,
        uint256 /*id*/
    ) external view returns (uint256) {
        // if the tokenData is not of the correct length, return 0.
        if (tokenData.length < 96) {
            return 0;
        }

        (bool isExpired, address owner, , , , ) = _isExpired(tokenData);
        if (isExpired) {
            return 0;
        }
        return _owner == owner ? 1 : 0;
    }

    function resolverFor(
        bytes calldata tokenData
    ) external view returns (address) {
        // if the tokenData is not of the correct length, return 0.
        if (tokenData.length < 96) {
            return address(0);
        }

        (bool isExpired, , address resolver, , , ) = _isExpired(tokenData);
        if (isExpired) {
            return address(0);
        }
        return resolver;
    }

    function expiryOf(bytes32 node) external view returns (uint64) {
        // get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));

        // if the tokenData is not of the correct length, return 0.
        if (tokenData.length != 96) {
            return 0;
        }

        (, , uint64 expiry, , ) = _unpack(tokenData);
        return expiry;
    }

    function fusesOf(bytes32 node) public view returns (uint64) {
        bytes memory tokenData = registry.getData(uint256(node));

        // if the tokenData is not of the correct length, return 0.
        if (tokenData.length < 96) {
            return 0;
        }

        (bool isExpired, , , , uint64 fuses, ) = _isExpired(tokenData);

        if (isExpired) {
            return 0;
        }
        return fuses;
    }

    function renewalControllerOf(bytes32 node) external view returns (address) {
        // get the tokenData
        bytes memory tokenData = registry.getData(uint256(node));

        // if the tokenData is not of the correct length, return 0.
        if (tokenData.length < 96) {
            return address(0);
        }

        (bool isExpired, , , , , address renewalController) = _isExpired(
            tokenData
        );

        if (isExpired) {
            return address(0);
        }
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
            bool isExpired,
            address owner,
            address resolver,
            uint64 expiry,
            uint64 fuses,
            address renewalController
        ) = _isExpired(tokenData);

        bool isAuthorized = registry.getAuthorization(
            uint256(node),
            owner,
            msg.sender
        );

        if (owner != msg.sender && !isAuthorized) {
            revert Unauthorised(node, msg.sender);
        }

        if (isExpired) {
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

    // A setFuses function that allows the owner of a node to set the fuses of the node.
    function setFuses(uint256 id, uint64 fuses) external {
        // get tokenData
        bytes memory tokenData = registry.getData(id);
        (
            address owner,
            address resolver,
            uint64 expiry,
            uint64 oldFuses,
            address renewalController
        ) = _unpack(tokenData);

        bool isAuthorized = registry.getAuthorization(id, owner, msg.sender);

        if (owner != msg.sender && !isAuthorized) {
            revert Unauthorised(bytes32(id), msg.sender);
        }

        // Make sure that the CANNOT_BURN_FUSES is not burned.
        require((oldFuses & CANNOT_BURN_FUSES) == 0, "Cannot burn fuses");

        // Make sure that PARENT_CANNOT_CONTROL is burned.
        require(
            (oldFuses & PARENT_CANNOT_CONTROL) != 0,
            "Parent cannot control"
        );

        registry.setNode(
            id,
            _pack(
                address(this),
                owner,
                resolver,
                expiry,
                fuses,
                renewalController
            )
        );
    }

    function setResolver(uint256 id, address newResolver) external {
        // Check to make sure that the fuse CANNOT_SET_RESOLVER is not burned.
        require(
            (fusesOf(bytes32(id)) & CANNOT_SET_RESOLVER) == 0,
            "Cannot set resolver"
        );

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

    // Set the expiry of a subnode, with a node and a label.
    function setExpiry(
        bytes32 node,
        bytes32 labelhash,
        uint64 newExpiry
    ) external {
        TokenData memory td;
        TokenData memory sub;

        // get the subnode
        bytes32 subnode = keccak256(abi.encodePacked(node, labelhash));

        // get tokenData
        bytes memory tokenData = registry.getData(uint256(node));

        // Make sure the parent node controller is this contract.
        require(
            address(_getController(tokenData)) == address(this),
            "Controller is not this contract"
        );

        // Make sure the tokenData is 96 bytes long.
        require(tokenData.length == 96, "Invalid tokenData length");

        (
            td.owner, // resolver // expiry
            ,
            ,
            td.fuses,
            td.renewalController
        ) = _unpack(tokenData);

        // Make sure the caller is authroized in the parent node.
        bool isAuthorized = registry.getAuthorization(
            uint256(node),
            td.owner,
            msg.sender
        );

        // get tokenDataSubnode
        bytes memory tokenDataSubnode = registry.getData(uint256(subnode));

        // Get the data of the subnode, including the fuses and renewal controller, get the data
        (sub.owner, sub.resolver, , sub.fuses, sub.renewalController) = _unpack(
            tokenDataSubnode
        );

        // Check to make sure the caller is authorized.
        if (
            // Allow the owner of the parent node to set the expiry as
            // long as there is no renewal controller set on the parent node.
            !(td.owner == msg.sender &&
                td.renewalController == address(0) &&
                sub.renewalController == address(0)) &&
            // Allow an authorized user of the parent node to set the expiry.
            !(isAuthorized &&
                td.renewalController == address(0) &&
                sub.renewalController == address(0)) &&
            // Allow the renewal controller of the parent node
            // as long as the there is no renewal controller set on the subnode
            // to set the expiry.
            !(td.renewalController == msg.sender &&
                sub.renewalController == address(0)) &&
            // Allow the renewal controller of the subnode to set the expiry.
            !(sub.renewalController == msg.sender)
        ) {
            revert Unauthorised(subnode, msg.sender);
        }

        registry.setNode(
            uint256(subnode),
            _pack(
                address(this),
                sub.owner,
                sub.resolver,
                newExpiry,
                sub.fuses,
                sub.renewalController
            )
        );
    }

    // Set node function that allows the owner of a node to set the node.
    function setNode(
        uint256 id,
        address owner,
        address resolver,
        uint64 fuses,
        address renewalController
    ) external {
        TokenData memory tdOld;

        // get tokenData
        bytes memory tokenData = registry.getData(id);
        (tdOld.owner, tdOld.resolver, tdOld.expiry, tdOld.fuses, ) = _unpack(
            tokenData
        );

        bool isAuthorized = registry.getAuthorization(
            id,
            tdOld.owner,
            msg.sender
        );

        if (tdOld.owner != msg.sender && !isAuthorized) {
            revert Unauthorised(bytes32(id), msg.sender);
        }

        // If fuses are being burned.
        if (fuses != 0) {
            // Make sure that the CANNOT_BURN_NAME is not burned.
            require((tdOld.fuses & CANNOT_BURN_FUSES) == 0, "Cannot burn name");

            // Make sure that PARENT_CANNOT_CONTROL is burned.
            require(
                (tdOld.fuses & PARENT_CANNOT_CONTROL) != 0,
                "Parent cannot control"
            );
        }

        // If the resolver is being changed.
        if (resolver != tdOld.resolver) {
            // Make sure that the CANNOT_SET_RESOLVER is not burned.
            require(
                (tdOld.fuses & CANNOT_SET_RESOLVER) == 0,
                "Cannot set resolver"
            );
        }

        // If the resolver is being set.

        registry.setNode(
            id,
            _pack(
                address(this),
                owner,
                resolver,
                tdOld.expiry,
                fuses | tdOld.fuses,
                renewalController
            )
        );
    }

    function setSubnode(
        bytes32 node,
        bytes32 labelhash,
        address subnodeOwner,
        address subnodeResolver,
        uint64 subnodeExpiry,
        uint64 subnodeFuses,
        address subnodeRenewalController
    ) external {
        TokenData memory tdNode;

        bytes memory tokenData = registry.getData(uint256(node));

        // Make sure the parent node controller is this contract.
        require(
            address(_getController(tokenData)) == address(this),
            "Controller is not this contract"
        );

        (tdNode.owner, , , tdNode.fuses, ) = _unpack(tokenData);

        // Check to make sure that the fuse CANNOT_CREATE_SUBDOMAIN is not burned.
        require(
            (tdNode.fuses & CANNOT_CREATE_SUBDOMAIN) == 0,
            "Cannot create subdomain"
        );

        // Make the node of the subnode.
        bytes32 subnode = keccak256(abi.encodePacked(node, labelhash));

        // Get the subnode fuses.
        uint64 subnodeFusesOld = fusesOf(subnode);

        // If subnode fuses are being burned.
        if (subnodeFuses != 0) {
            require(
                ((tdNode.fuses & CANNOT_BURN_NAME) | PARENT_CANNOT_CONTROL) ==
                    CANNOT_BURN_NAME | PARENT_CANNOT_CONTROL,
                "The parent node is missing required fuses"
            );

            // Make sure that the CANNOT_BURN_FUSES is not burned in the existing subnode.
            require(
                (subnodeFusesOld & CANNOT_BURN_FUSES) == 0,
                "Cannot burn fuses"
            );

            // Make sure that PARENT_CANNOT_CONTROL is burned already on the subnode,
            // or is being burned.
            require(
                ((subnodeFusesOld | subnodeFuses) & PARENT_CANNOT_CONTROL) != 0,
                "Parent cannot control"
            );
        }

        bool isAuthorized = registry.getAuthorization(
            uint256(node),
            tdNode.owner,
            msg.sender
        );

        if (tdNode.owner != msg.sender && !isAuthorized) {
            revert Unauthorised(node, msg.sender);
        }

        registry.setSubnode(
            uint256(node),
            uint256(labelhash),
            _pack(
                address(this),
                subnodeOwner,
                subnodeResolver,
                subnodeExpiry,
                subnodeFusesOld | subnodeFuses, // if there were fuses, then add them to the existing fuses.
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

    function _isExpired(
        bytes memory tokenData
    )
        internal
        view
        returns (
            bool isExpired,
            address owner,
            address resolver,
            uint64 expiry,
            uint64 fuses,
            address renewalController
        )
    {
        (owner, resolver, expiry, fuses, renewalController) = _unpack(
            tokenData
        );
        isExpired = expiry <= block.timestamp;
    }

    function _unpack(
        bytes memory tokenData
    )
        internal
        pure
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
    ) internal pure returns (bytes memory /*tokenData*/) {
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

    function _getController(
        bytes memory data
    ) internal pure returns (IController addr) {
        if (data.length < 20) {
            return IController(address(0));
        }
        assembly {
            addr := mload(add(data, 20))
        }
    }
}
