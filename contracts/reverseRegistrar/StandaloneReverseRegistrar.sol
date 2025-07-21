// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {ERC165} from "@openzeppelin/contracts-v5/utils/introspection/ERC165.sol";

import {IStandaloneReverseRegistrar} from "./IStandaloneReverseRegistrar.sol";

/// @title Standalone Reverse Registrar
/// @notice A standalone reverse registrar, detached from the ENS registry.
contract StandaloneReverseRegistrar is ERC165, IStandaloneReverseRegistrar {
    /// @notice The mapping of addresses to names.
    mapping(address => string) internal _names;

    /// @inheritdoc IStandaloneReverseRegistrar
    function nameForAddr(
        address addr
    ) external view returns (string memory name) {
        name = _names[addr];
    }

    /// @notice Sets the name for an address.
    ///
    /// @dev Authorisation should be checked before calling.
    ///
    /// @param addr The address to set the name for.
    /// @param name The name to set.
    function _setName(address addr, string calldata name) internal {
        _names[addr] = name;
        emit NameForAddrChanged(addr, name);
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(ERC165) returns (bool) {
        return
            interfaceID == type(IStandaloneReverseRegistrar).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
