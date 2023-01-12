//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IMetadataService} from "../../contracts/wrapper/IMetadataService.sol";
import {ENS} from "../../contracts/registry/ENS.sol";
import {IBaseRegistrar} from "../../contracts/ethregistrar/IBaseRegistrar.sol";
import {NameWrapper} from "../munged/NameWrapper.sol";
import {BytesUtils} from "../../contracts/wrapper/BytesUtils.sol";
//import {BytesUtils} from "./BytesUtilsHarness.sol";

contract NameWrapperHarness is NameWrapper {

    using BytesUtils for bytes;

    constructor(
        ENS _ens,
        IBaseRegistrar _registrar,
        IMetadataService _metadataService
    ) NameWrapper (_ens, _registrar, _metadataService) {}

    // Certora implementations

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

    function setSubnodeOwner(
        bytes32 parentNode,
        string calldata label,
        address owner,
        uint32 fuses,
        uint64 expiry
    )
        public override
        onlyTokenOwner(parentNode)
        canCallSetSubnodeOwner(parentNode, keccak256(bytes(label)))
        returns (bytes32 node)
    {
        return super.setSubnodeOwner(parentNode, label, owner, fuses, expiry);
    }

    function setSubnodeRecord(
        bytes32 parentNode,
        string memory label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    )
        public override
        onlyTokenOwner(parentNode)
        canCallSetSubnodeOwner(parentNode, keccak256(bytes(label)))
        returns (bytes32 node)
    {
        return super.setSubnodeRecord(parentNode, label, owner, resolver, ttl,
            fuses, expiry);
    }

    function setData(uint256 tokenId, address owner, uint32 fuses, uint64 expiry) public {
        super._setData(tokenId, owner, fuses, expiry);
    }

    // Getters and view functions

    //function addGetLabel(string memory label) public pure returns (bytes32) {
    //    bytes memory name = _addLabel(label, "\x03eth\x00");
    //    (bytes32 labelHash, ) = name.readLabel(0);
    //    return labelHash;
    //}

    function getDataSuper(uint256 tokenId) external view returns (address, uint32, uint64) {
        uint256 t = _tokens[tokenId];
        address owner = address(uint160(t));
        uint64 expiry = uint64(t >> 192);
        uint32 fuses = uint32(t >> 160);
        return (owner, fuses, expiry);
    }

    function getExpiry(bytes32 node) external view returns (uint64 expiry) {
        ( , , expiry) = getData(uint256(node));
    }

    function makeNodeFromName(bytes calldata name) external pure 
    returns(bytes32 node) {
        (bytes32 labelhash, uint256 offset) = name.readLabel(0);
        bytes32 parentNode = name.namehash(offset);
        node = _makeNode(parentNode, labelhash);
    }

    function getLabelHashAndOffset(bytes32 node) external view 
    returns (bytes32 labelHash, uint256 offset) {
        bytes memory name = names[node];
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