//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {INameWrapper, PARENT_CANNOT_CONTROL, CAN_EXTEND_EXPIRY} from "../wrapper/INameWrapper.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {BaseSubdomainRegistrar, DataMissing, Unavailable, NameNotRegistered} from "./BaseSubdomainRegistrar.sol";
import {IForeverSubdomainRegistrar} from "./IForeverSubdomainRegistrar.sol";
import {ISubnamePricer} from "./subname-pricers/ISubnamePricer.sol";

error ParentNameNotSetup(bytes32 parentNode);

contract ForeverSubdomainRegistrar is
    BaseSubdomainRegistrar,
    ERC1155Holder,
    IForeverSubdomainRegistrar
{
    constructor(address wrapper) BaseSubdomainRegistrar(wrapper) {}

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
