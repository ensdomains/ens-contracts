//SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;
import {ISubdomainPricer} from "./pricers/ISubdomainPricer.sol";

interface IForeverSubdomainRegistrar {
    function setupDomain(
        bytes32 node,
        ISubdomainPricer pricer,
        address beneficiary,
        bool active
    ) external;

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint16 ownerControlledfuses,
        bytes[] calldata records
    ) external payable;

    function available(bytes32 node) external view returns (bool);
}
