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
        require (bytes(label).length == 32);
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
        require (bytes(label).length == 32);
        return super.setSubnodeRecord(parentNode, label, owner, resolver, ttl,
            fuses, expiry);
    }

    function wrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint16 ownerControlledFuses,
        address resolver
    ) public override {
        require (bytes(label).length == 32);
        super.wrapETH2LD(label, wrappedOwner, ownerControlledFuses, resolver);
    }

    function getDataSuper(uint256 tokenId) public view returns (address, uint32, uint64) {
        uint256 t = _tokens[tokenId];
        address owner = address(uint160(t));
        uint64 expiry = uint64(t >> 192);
        uint32 fuses = uint32(t >> 160);
        return (owner, fuses, expiry);
    }

    function getFusesSuper(uint256 tokenId) external view returns (uint32 fuses) {
        uint256 t = _tokens[tokenId];
        fuses = uint32(t >> 160);
    }

    function getExpiry(bytes32 node) external view returns (uint64 expiry) {
        ( , , expiry) = getData(uint256(node));
    }

    function getEthLabelhash(bytes32 node) external view 
    returns (bytes32 labelhash) 
    {
        (, uint32 fuses, ) = getDataSuper(uint256(node));
        return _getEthLabelhash(node, fuses);
    }

    function makeNodeFromName(bytes memory name) external pure 
    returns(bytes32 node, bytes32 parentNode) {
        (bytes32 labelhash, uint256 offset) = name.readLabel(0);
        parentNode = name.namehash(offset);
        node = _makeNode(parentNode, labelhash);
    }

    function getLabelHashAndOffset(bytes32 node) external view 
    returns (bytes32 labelHash, uint256 offset) {
        bytes memory name = names[node];
        (labelHash, offset) = name.readLabel(0);
    }

    function getParentNodeByNode(bytes32 node) external view returns (bytes32 parentNode) {
        bytes memory name = names[node];
        require(0 < name.length, "Error: empty bytes");
        uint256 len = uint256(uint8(name[0]));
        parentNode = name.namehash(len + 1);
    }

    function getLabelHash(string memory label) external pure returns (bytes32 labelHash) {
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