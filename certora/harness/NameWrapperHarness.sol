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

    function setData(uint256 tokenId, address owner, uint32 fuses, uint64 expiry) public {
        super._setData(tokenId, owner, fuses, expiry);
    }

    function getExpiry(bytes32 node) external view returns (uint64 expiry) {
        ( , , expiry) = getData(uint256(node));
    }

    function getLabelHashAndOffset(bytes calldata name) external pure 
    returns (bytes32 labelHash, uint256 offset) {
        (labelHash, offset) = name.readLabel(0);
    }

    function getParentNodeByName(bytes calldata name) external pure returns (bytes32 parentNode) {
        require(0 < name.length, "Error: empty bytes");
        uint256 len = uint256(uint8(name[0]));
        parentNode = name.namehash(len + 1);
    }

    function getParentNodeByNode(bytes32 node) external view returns (bytes32 parentNode) {
        bytes memory name = names[node];
        require(0 < name.length, "Error: empty bytes");
        uint256 len = uint256(uint8(name[0]));
        parentNode = name.namehash(len + 1);
    }

    function getLabelHash(string calldata label) external pure returns (bytes32 labelHash) {
        labelHash = keccak256(bytes(label));
    }

    // Call to _makenode
    function makeNode(bytes32 parentNode, bytes32 labelhash) external pure returns (bytes32 node) {
        node = _makeNode(parentNode, labelhash);
    }

    // Converts node to tokenId (bytes32 -> uint256)
    function tokenIDFromNode(bytes32 node) external pure returns (uint256 tokenID) {
        tokenID = uint256(node);
    }
}