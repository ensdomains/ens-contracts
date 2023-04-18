//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {ENS} from "../registry/ENS.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {PublicResolver} from "./PublicResolver.sol";

error AvatarCannotBeSetByOwner();

/**
 *
 * This resolver allows the owner of a node to set the avatar of a child node.
 *
 */
contract ParentAvatarResolver is PublicResolver {
    constructor(
        ENS _ens,
        INameWrapper wrapperAddress,
        address _trustedETHController,
        address _trustedReverseRegistrar
    )
        PublicResolver(
            _ens,
            wrapperAddress,
            _trustedETHController,
            _trustedReverseRegistrar
        )
    {}

    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external override authorised(node) {
        // check if key is avatar
        if (
            keccak256(abi.encodePacked(key)) ==
            keccak256(abi.encodePacked("avatar"))
        ) {
            revert AvatarCannotBeSetByOwner();
        }

        _setText(node, key, value);
    }

    function setAvatar(
        bytes32 parentNode,
        bytes32 labelhash,
        string calldata value
    ) external authorised(parentNode) {
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelhash));
        _setText(node, "avatar", value);
    }

    function _setText(
        bytes32 node,
        string memory key,
        string calldata value
    ) internal {
        versionable_texts[recordVersions[node]][node][key] = value;
        emit TextChanged(node, key, key, value);
    }
}
