//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IMetadataService} from "../../contracts/wrapper/IMetadataService.sol";
import {ENS} from "../../contracts/registry/ENS.sol";
import {IBaseRegistrar} from "../../contracts/ethregistrar/IBaseRegistrar.sol";
import {NameWrapper} from "../munged/NameWrapper.sol";
//import {BytesUtils} from "../../contracts/wrapper/BytesUtils.sol";
import {BytesUtils} from "./BytesUtilsHarness.sol";

contract NameWrapperHarness is NameWrapper {

    using BytesUtils for bytes;

    constructor(
        ENS _ens,
        IBaseRegistrar _registrar,
        IMetadataService _metadataService
    ) NameWrapper (_ens, _registrar, _metadataService) {}

    // Certora overriding implementations

    /**
    * @notice : leaving empty, scope ignores upgrade contract
     */ 
    function upgradeETH2LD(
        string calldata label,
        address wrappedOwner,
        address resolver
    ) public override {}

    /**
    * @notice : leaving empty, scope ignores upgrade contract
     */
    function upgrade(
        bytes32 parentNode,
        string calldata label,
        address wrappedOwner,
        address resolver
    ) public override {}
    

    /**
    * @notice : Modifiers have been moved here to avoid stack too deep errors
    * when compiled with the tool.
    * Assuming a word-aligned label for the sake of healthy hashing modeling.
     */
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

    /**
    * @notice : Modifiers have been moved here to avoid stack too deep errors
    * when compiled with the tool.
    * Assuming a word-aligned label for the sake of healthy hashing modeling.
     */
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

    /**
    * @notice : Assuming a word-aligned label for the sake of healthy hashing modeling.
     */
    function wrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint16 ownerControlledFuses,
        address resolver
    ) public override {
        require (bytes(label).length == 32);
        super.wrapETH2LD(label, wrappedOwner, ownerControlledFuses, resolver);
    }

    // Certora getters: to be used inside the spec for convenience.

    /**
    * implements the super.getData() implementation of ERC1155Fuse contract.
     */
    function getDataSuper(uint256 tokenId) public view returns (address, uint32, uint64) {
        uint256 t = _tokens[tokenId];
        address owner = address(uint160(t));
        uint64 expiry = uint64(t >> 192);
        uint32 fuses = uint32(t >> 160);
        return (owner, fuses, expiry);
    }

    /**
    * extracts the 'fuses' attribute of a tokenId from _tokens[].
     */
    function getFusesSuper(uint256 tokenId) external view returns (uint32 fuses) {
        uint256 t = _tokens[tokenId];
        fuses = uint32(t >> 160);
    }

    /**
    * extracts the 'expiry' attribute of a tokenId.
     */
    function getExpiry(bytes32 node) external view returns (uint64 expiry) {
        ( , , expiry) = getData(uint256(node));
    }

    /**
    * calls _getEthLabelhash(node, fuses) and returns the labelhash.
     */
    function getEthLabelhash(bytes32 node) external view 
    returns (bytes32 labelhash) 
    {
        (, uint32 fuses, ) = getDataSuper(uint256(node));
        return _getEthLabelhash(node, fuses);
    }

    /**
    * For any name (bytes), returns the node and the parent node for that name
    * by calling the readLabel and namehash functions of BytesUtils.
     */
    function makeNodeFromName(bytes memory name) external pure 
    returns(bytes32 node, bytes32 parentNode) {
        (bytes32 labelhash, uint256 offset) = name.readLabel(0);
        parentNode = name.namehash(offset);
        node = _makeNode(parentNode, labelhash);
    }

    /**
    * extracts the name from the names[node] mapping, and returns its labelHash and offset.
     */
    function getLabelHashAndOffset(bytes32 node) external view 
    returns (bytes32 labelHash, uint256 offset) {
        bytes memory name = names[node];
        (labelHash, offset) = name.readLabel(0);
    }

    /**
    * returns the parent node of any node, by accessing the name and then hashing the name
    * strarting from the first label offset
     */
    function getParentNodeByNode(bytes32 node) external view returns (bytes32 parentNode) {
        bytes memory name = names[node];
        require(0 < name.length, "Error: empty bytes");
        uint256 len = uint256(uint8(name[0]));
        parentNode = name.namehash(len + 1);
    }

    /**
    * returns the keccak256 hash of a label
     */
    function getLabelHash(string memory label) external pure returns (bytes32 labelHash) {
        labelHash = keccak256(bytes(label));
    }

    /**
    * Call to _makenode(parentNode, labelhash)
     */
    function makeNode(bytes32 parentNode, bytes32 labelhash) external pure returns (bytes32 node) {
        node = _makeNode(parentNode, labelhash);
    }
  
    /**
    * Converts node to tokenId (bytes32 -> uint256)
     */
    function tokenIDFromNode(bytes32 node) external pure returns (uint256 tokenID) {
        tokenID = uint256(node);
    }
}
