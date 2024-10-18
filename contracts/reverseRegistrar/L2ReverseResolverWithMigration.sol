// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {L2ReverseResolver} from "./L2ReverseResolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract L2ReverseResolverWithMigration is L2ReverseResolver, Ownable {
    INameResolver immutable oldReverseResolver;

    constructor(
        bytes32 _L2ReverseNode,
        uint256 _coinType,
        INameResolver _oldReverseResolver
    ) L2ReverseResolver(_L2ReverseNode, _coinType) {
        oldReverseResolver = _oldReverseResolver;
    }

    function batchSetName(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            bytes32 node = _getNamehash(addresses[i]);
            string memory name = oldReverseResolver.name(node);
            _setName(node, name);
            emit ReverseClaimed(addresses[i], node);
        }
    }
}
