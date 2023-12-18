//SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;
import {ISubdomainPricer} from "./pricers/ISubdomainPricer.sol";

interface IRentalSubdomainRegistrar {
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
        uint64 duration,
        bytes[] calldata records
    ) external payable;

    function batchRegister(
        bytes32 parentNode,
        string[] calldata labels,
        address[] calldata addresses,
        address resolver,
        uint16 fuses,
        uint64 duration,
        bytes[][] calldata records
    ) external payable;

    function renew(
        bytes32 parentNode,
        string calldata label,
        uint64 duration
    ) external payable returns (uint64 newExpiry);

    function batchRenew(
        bytes32 parentNode,
        string[] calldata labels,
        uint64 duration
    ) external payable;

    function available(bytes32 node) external view returns (bool);
}
