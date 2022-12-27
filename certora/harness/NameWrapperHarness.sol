//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IMetadataService} from "../../contracts/wrapper/IMetadataService.sol";
import {ENS} from "../../contracts/registry/ENS.sol";
import {IBaseRegistrar} from "../../contracts/ethregistrar/IBaseRegistrar.sol";
import {NameWrapper} from "../munged/NameWrapper.sol";
import {BytesUtils} from "../../contracts/wrapper/BytesUtils.sol";

contract NameWrapperHarness is NameWrapper {

    using BytesUtils for bytes;

    constructor(
        ENS _ens,
        IBaseRegistrar _registrar,
        IMetadataService _metadataService
    ) NameWrapper (_ens, _registrar, _metadataService) {}

    function upgradeETH2LD(
        string calldata label,
        address wrappedOwner,
        address resolver
    ) public override {}

    function upgrade(
        bytes32 parentNode,
        string calldata label,
        address wrappedOwner,
        address resolver
    ) public override {}

    function getLabelHashAndOffset(bytes calldata name) external pure 
    returns (bytes32, uint256) {
        return name.readLabel(0);
    }

    function getParentNode(bytes calldata name, uint256 offset) external pure 
    returns (bytes32) {
        return name.namehash(offset);
    }

    function makeNode(bytes32 node, bytes32 labelhash) external pure
    returns (bytes32) {
        return _makeNode(node, labelhash);
    }
}