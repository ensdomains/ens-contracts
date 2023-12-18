//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ISubdomainPricer {
    function price(
        bytes32 parentNode,
        string calldata label,
        uint256 duration
    ) external view returns (address token, uint256 price);
}
