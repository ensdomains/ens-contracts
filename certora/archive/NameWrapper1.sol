//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IMetadataService} from "../../contracts/wrapper/IMetadataService.sol";
import {ENS} from "../../contracts/registry/ENS.sol";
import {IBaseRegistrar} from "../../contracts/ethregistrar/IBaseRegistrar.sol";
import {NameWrapper} from "../munged/NameWrapper.sol";

contract NameWrapperHarness is NameWrapper {
    
    bytes32 public Node;
    bytes32 public ParentNode;
    bytes32 public Labelhash;
    address public Resolver;
    uint32 public Fuses;
    uint64 public Ttl;
    uint64 public Expiry;
    string public Label;

    constructor(
        ENS _ens,
        IBaseRegistrar _registrar,
        IMetadataService _metadataService
    ) NameWrapper (_ens, _registrar, _metadataService) {}

    function setSubnodeOwner(
        bytes32, string calldata label, address owner, uint32, uint64)
        public override returns (bytes32)
    {
        return super.setSubnodeOwner(ParentNode, label, owner, Fuses, Expiry);
    }

    function setSubnodeRecord(
        bytes32, string memory, address owner, address, uint64, uint32, uint64) 
        public override returns (bytes32)
    {
        return super.setSubnodeRecord(ParentNode, Label, owner, Resolver, Ttl, Fuses, Expiry);
    }
}

    