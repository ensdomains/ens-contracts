//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

interface ILinearPremiumPriceOracle {
    function timeUntilPremium(uint256 expires, uint256 amount)
        external
        view
        returns (uint256);
}
