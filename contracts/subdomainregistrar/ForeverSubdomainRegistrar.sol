//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {INameWrapper, PARENT_CANNOT_CONTROL, CAN_EXTEND_EXPIRY} from "../wrapper/INameWrapper.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {BaseSubdomainRegistrar, InsufficientFunds, DataMissing, Unavailable, NameNotRegistered} from "./BaseSubdomainRegistrar.sol";
import {IForeverSubdomainRegistrar} from "./IForeverSubdomainRegistrar.sol";

struct Name {
    uint256 registrationFee; // per registration
    address token; // ERC20 token
    address beneficiary;
}

contract ForeverSubdomainRegistrar is
    BaseSubdomainRegistrar,
    ERC1155Holder,
    IForeverSubdomainRegistrar
{
    mapping(bytes32 => Name) public names;

    constructor(address wrapper) BaseSubdomainRegistrar(wrapper) {}

    function setupDomain(
        bytes32 node,
        address token,
        uint256 fee,
        address beneficiary
    ) public onlyOwner(node) {
        names[node].registrationFee = fee;
        names[node].token = token;
        names[node].beneficiary = beneficiary;
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

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint16 fuses,
        bytes[] calldata records
    ) public payable {
        uint256 fee = names[parentNode].registrationFee;

        if (fee > 0) {
            if (IERC20(names[parentNode].token).balanceOf(msg.sender) < fee) {
                revert InsufficientFunds();
            }

            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        (, , uint64 parentExpiry) = wrapper.getData(uint256(parentNode));

        _register(
            parentNode,
            label,
            newOwner,
            resolver,
            uint32(fuses) | CAN_EXTEND_EXPIRY,
            parentExpiry,
            records
        );
    }
}
