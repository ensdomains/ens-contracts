//SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

interface IForeverSubdomainRegistrar {
    function setupDomain(
        bytes32 node,
        address token,
        uint256 fee,
        address beneficiary
    ) external;

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint16 ownerControlledfuses,
        bytes[] calldata records
    ) external payable;

    // function available(bytes32 node) external view returns (bool);
}
