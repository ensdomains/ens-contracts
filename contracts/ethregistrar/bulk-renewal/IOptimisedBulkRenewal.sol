//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

interface IOptimisedBulkRenewal {
    function rentPrice(
        string[] calldata names,
        uint256 duration
    )
        external
        view
        returns (
            uint256 total,
            uint256 fiveCharPrice,
            uint256 fourCharPrice,
            uint256 threeCharPrice
        );

    function renewAll(
        string[] calldata names,
        uint256 duration,
        uint256 fiveCharPrice,
        uint256 fourCharPrice,
        uint256 threeCharPrice
    ) external payable;
}
