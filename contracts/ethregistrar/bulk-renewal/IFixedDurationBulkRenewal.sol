//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

interface IFixedDurationBulkRenewal {
    function getFixedDurationPriceData(
        string[] calldata names,
        uint256 duration
    ) external view returns (uint256 total, uint256[] memory prices);

    function renewAllWithFixedDuration(
        string[] calldata names,
        uint256 duration,
        uint256[] calldata prices
    ) external payable;
}
