//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IMetadataService} from "../../contracts/wrapper/IMetadataService.sol";
import {ENS} from "../../contracts/registry/ENS.sol";
import {IBaseRegistrar} from "../../contracts/ethregistrar/IBaseRegistrar.sol";
import {NameWrapper} from "../munged/NameWrapper.sol";

contract NameWrapperHarness is NameWrapper {

    struct SubnodeRecord 
    {
        bytes32 node;
        bytes32 parentNode;
        bytes32 labelhash;
        address resolver;
        uint256 fuses;
        uint256 ttl;
        uint256 expiry;
    }

    SubnodeRecord public subnodeRecord1;
    string public label1;

    constructor(
        ENS _ens,
        IBaseRegistrar _registrar,
        IMetadataService _metadataService
    ) NameWrapper (_ens, _registrar, _metadataService) {}


    function setSubnodeOwner(
        bytes32 parentNode,
        string calldata,
        address owner,
        uint32,
        uint64
    )
        public override
        onlyTokenOwner(parentNode)
        canCallSetSubnodeOwner(parentNode, keccak256(bytes(label1)))
        returns (bytes32 node)
    {
        
        bytes32 labelhash = keccak256(bytes(label1));
        SubnodeRecord storage subRec = subnodeRecord1;
        subRec.parentNode = parentNode;
        node = _makeNode(parentNode, labelhash);
        _setSubnodeOwner(subRec, label1, owner);
    }

    function setSubnodeRecord(
        bytes32 parentNode,
        string memory,
        address owner,
        address,
        uint64,
        uint32,
        uint64 
    )
        public override
        onlyTokenOwner(parentNode)
        canCallSetSubnodeOwner(parentNode, keccak256(bytes(label1)))
        returns (bytes32 node)
    {
        SubnodeRecord storage subRec = subnodeRecord1;
        subRec.parentNode = parentNode;
        node = _makeNode(parentNode, subRec.labelhash);
        _checkFusesAreSettable(subRec.node, uint32(subRec.fuses));
        _saveLabel(parentNode, subRec.node, label1);
        subRec.expiry = _checkParentFusesAndExpiry(parentNode, node, uint32(subRec.fuses), uint64(subRec.expiry));
        
        _setSubnodeRecord(subRec, label1, owner);
    }

    function _setSubnodeRecord(SubnodeRecord memory subRec, string memory label, address owner) internal {
        if (ownerOf(uint256(subRec.node)) == address(0)) {
            ens.setSubnodeRecord(
                subRec.parentNode,
                subRec.labelhash,
                address(this),
                subRec.resolver,
                uint64(subRec.ttl)
            );
            _storeNameAndWrap(subRec.parentNode, subRec.node, label,
             owner, uint32(subRec.fuses), uint64(subRec.expiry));
        } else {
            ens.setSubnodeRecord(
                subRec.parentNode,
                subRec.labelhash,
                address(this),
                subRec.resolver,
                uint64(subRec.ttl)
            );
            _updateName(subRec.parentNode, subRec.node, label,
                 owner, uint32(subRec.fuses),  uint64(subRec.expiry));
        }
    }

    function _setSubnodeOwner(SubnodeRecord memory subRec, string memory label, address owner) internal {
        _checkFusesAreSettable(subRec.node, uint32(subRec.fuses));
        bytes memory name = _saveLabel(subRec.parentNode, subRec.node, label);
        subRec.expiry = _checkParentFusesAndExpiry(subRec.parentNode, subRec.node, uint32(subRec.fuses), uint64(subRec.expiry));

        if (ownerOf(uint256(subRec.node)) == address(0)) {
            ens.setSubnodeOwner(subRec.parentNode, subRec.labelhash, address(this));
            _wrap(subRec.node, name, owner, uint32(subRec.fuses), uint64(subRec.expiry));
        } else {
            _updateName(subRec.parentNode, subRec.node, label, owner, uint32(subRec.fuses), uint64(subRec.expiry));
        }
        
    }
        
}

    