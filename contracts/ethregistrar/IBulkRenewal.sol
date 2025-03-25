//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IBulkRenewal {
    function rentPrice(
        string[] calldata names,
        uint256 duration
    ) external view returns (uint256 total);

    function renewAll(
        string[] calldata names,
        uint256 duration
    ) external payable;
}
