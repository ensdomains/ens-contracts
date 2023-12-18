//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {INameWrapper, IS_DOT_ETH, PARENT_CANNOT_CONTROL, CAN_EXTEND_EXPIRY} from "../wrapper/INameWrapper.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {BaseSubdomainRegistrar, DataMissing, Unavailable, NameNotRegistered} from "./BaseSubdomainRegistrar.sol";
import {IForeverSubdomainRegistrar} from "./IForeverSubdomainRegistrar.sol";
import {ISubdomainPricer} from "./pricers/ISubdomainPricer.sol";

error ParentNameNotSetup(bytes32 parentNode);

contract ForeverSubdomainRegistrar is
    BaseSubdomainRegistrar,
    ERC1155Holder,
    IForeverSubdomainRegistrar
{
    constructor(address wrapper) BaseSubdomainRegistrar(wrapper) {}

    bytes32 private constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint16 fuses,
        bytes[] calldata records
    ) public payable {
        (, uint32 parentFuses, uint64 expiry) = wrapper.getData(
            uint256(parentNode)
        );
        uint64 duration = expiry - uint64(block.timestamp);
        if (parentFuses & IS_DOT_ETH == IS_DOT_ETH) {
            duration = duration - GRACE_PERIOD;
        }
        super.register(
            parentNode,
            label,
            newOwner,
            resolver,
            CAN_EXTEND_EXPIRY | PARENT_CANNOT_CONTROL | uint32(fuses),
            duration,
            records
        );
    }

    function setupDomain(
        bytes32 node,
        ISubdomainPricer pricer,
        address beneficiary,
        bool active
    ) public override authorised(node) {
        _setupDomain(node, pricer, beneficiary, active);
    }

    function available(
        bytes32 node
    )
        public
        view
        override(BaseSubdomainRegistrar, IForeverSubdomainRegistrar)
        returns (bool)
    {
        return super.available(node);
    }
}
