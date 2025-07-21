// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";

import {L2ReverseRegistrar} from "./L2ReverseRegistrar.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {AddressUtils} from "../utils/AddressUtils.sol";

/// @notice An L2 Reverse Registrar that allows migrating from a prior resolver.
contract L2ReverseRegistrarWithMigration is L2ReverseRegistrar, Ownable {
    using AddressUtils for address;

    /// @notice The old reverse resolver to migrate from
    INameResolver immutable oldReverseResolver;

    /// @notice The parent node of reverse nodes. The convention is '${coinType}.reverse'
    bytes32 immutable parentNode;

    /// @notice Initialises the contract by setting the parent node, coin type, and old reverse resolver.
    ///
    /// @param coinType_ The cointype converted from the chainId of the chain this contract is deployed to.
    /// @param owner_ The initial owner of the contract.
    /// @param parentNode_ The parent node to set. The convention is '${coinType}.reverse'.
    /// @param oldReverseResolver_ The old reverse resolver.
    constructor(
        uint256 coinType_,
        address owner_,
        bytes32 parentNode_,
        INameResolver oldReverseResolver_
    ) L2ReverseRegistrar(coinType_) Ownable(owner_) {
        parentNode = parentNode_;
        oldReverseResolver = oldReverseResolver_;
    }

    /// @notice Migrates the names from the old reverse resolver to the new one.
    ///         Only callable by the owner.
    ///
    /// @param addresses The addresses to migrate.
    function batchSetName(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            // namehash of `[addresses[i]].[coinType].reverse`
            bytes32 node = keccak256(
                abi.encodePacked(parentNode, addresses[i].sha3HexAddress())
            );
            string memory name = oldReverseResolver.name(node);

            // equivalent to _setName(addresses[i], name);
            // internal because the name value isn't in calldata
            _names[addresses[i]] = name;
            emit NameForAddrChanged(addresses[i], name);
        }
    }
}
