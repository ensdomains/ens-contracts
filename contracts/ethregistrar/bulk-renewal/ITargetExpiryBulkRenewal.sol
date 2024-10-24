//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

interface ITargetExpiryBulkRenewal {
    function getTargetExpiryPriceData(
        string[] calldata names,
        uint256 targetExpiry
    )
        external
        view
        returns (
            uint256 total,
            uint256[] memory durations,
            uint256[] memory prices
        );

    function renewAllWithTargetExpiry(
        string[] calldata names,
        uint256[] calldata duration,
        uint256[] calldata prices
    ) external payable;
}
