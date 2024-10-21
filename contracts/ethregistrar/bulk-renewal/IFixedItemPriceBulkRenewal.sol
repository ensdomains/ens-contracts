//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

interface IFixedItemPriceBulkRenewal {
    function getFixedItemPricePriceData(
        string[] calldata names,
        uint256 duration
    ) external view returns (uint256 total, uint256 itemPrice);

    function renewAllWithFixedItemPrice(
        string[] calldata names,
        uint256 duration,
        uint256 itemPrice
    ) external payable;
}
