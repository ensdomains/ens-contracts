// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {L2ReverseResolver} from "./L2ReverseResolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice An L2 reverse resolver tha allows migrating from a prior resolver.
contract L2ReverseResolverWithMigration is L2ReverseResolver, Ownable {
    /// @notice The old reverse resolver
    INameResolver immutable oldReverseResolver;

    /// @notice Sets the namespace, coin type, and old reverse resolver
    /// @param _L2ReverseNode The namespace to set. The converntion is '${coinType}.reverse'
    /// @param _coinType The cointype converted from the chainId of the chain this contract is deployed to.
    /// @param _oldReverseResolver The old reverse resolver
    constructor(
        bytes32 _L2ReverseNode,
        uint256 _coinType,
        INameResolver _oldReverseResolver
    ) L2ReverseResolver(_L2ReverseNode, _coinType) {
        oldReverseResolver = _oldReverseResolver;
    }

    /// @notice Migrates the names from the old reverse resolver to the new one.
    ///         Only callable by the owner.
    /// @param addresses The addresses to migrate
    function batchSetName(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            bytes32 node = _getNamehash(addresses[i]);
            string memory name = oldReverseResolver.name(node);
            _setName(addresses[i], node, name);
        }
    }
}
