// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {BaseRegistrarImplementation} from "./BaseRegistrarImplementation.sol";
import {Controllable} from "../root/Controllable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @title RegistrarSecurityController
/// @notice Break-glass controller for the base registrar.
/// @dev Acts as a pass-through for the base registrar, but with the ability for
///      security controllers to disable registrar controllers.
contract RegistrarSecurityController is Controllable, ERC165 {

    /// @notice The registrar this controller manages.
    BaseRegistrarImplementation public registrar;

    /// @param _registrar The base registrar to manage.
    constructor(BaseRegistrarImplementation _registrar) {
        registrar = _registrar;
    }

    /// @notice Grants registrar controller permissions.
    /// @param controller The registrar controller to add.
    function addRegistrarController(address controller) external onlyOwner {
        registrar.addController(controller);
    }

    /// @notice Revokes registrar controller permissions.
    /// @param controller The registrar controller to remove.
    function removeRegistrarController(address controller) external onlyOwner {
        registrar.removeController(controller);
    }

    /// @notice Sets the registrar's resolver for the base node.
    /// @param resolver The resolver address to set.
    function setRegistrarResolver(address resolver) external onlyOwner {
        registrar.setResolver(resolver);
    }

    /// @notice Transfers ownership of the registrar.
    /// @param newOwner The new owner for the registrar.
    function transferRegistrarOwnership(address newOwner) public virtual onlyOwner {
        registrar.transferOwnership(newOwner);
    }

    /// @notice Removes a registrar controller in emergencies.
    /// @dev Callable only by security controllers.
    /// @param controller The registrar controller to remove.
    function disableRegistrarController(address controller) external onlyController {
        registrar.removeController(controller);
    }
}
