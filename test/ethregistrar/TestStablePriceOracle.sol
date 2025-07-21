// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/ethregistrar/StablePriceOracle.sol";
import "../../contracts/ethregistrar/DummyOracle.sol";
import "../../contracts/ethregistrar/IPriceOracle.sol";
import {AggregatorInterface} from "../../contracts/ethregistrar/StablePriceOracle.sol";

contract TestStablePriceOracle is Test {
    DummyOracle public dummyOracle;

    function setUp() public {
        // Dummy oracle with 1 ETH == 10 USD
        dummyOracle = new DummyOracle(1000000000);
    }

    function testShouldReturnCorrectPrices() public {
        // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
        // 1 attousd per second for longer names
        uint256[] memory prices = new uint256[](5);
        prices[0] = 0;
        prices[1] = 0;
        prices[2] = 4;
        prices[3] = 2;
        prices[4] = 1;

        StablePriceOracle priceOracle = new StablePriceOracle(
            AggregatorInterface(address(dummyOracle)),
            prices
        );

        IPriceOracle.Price memory price1 = priceOracle.price("foo", 0, 3600);
        assertEq(price1.base, 1440, "foo price should be 1440");

        IPriceOracle.Price memory price2 = priceOracle.price("quux", 0, 3600);
        assertEq(price2.base, 720, "quux price should be 720");

        IPriceOracle.Price memory price3 = priceOracle.price("fubar", 0, 3600);
        assertEq(price3.base, 360, "fubar price should be 360");

        IPriceOracle.Price memory price4 = priceOracle.price("foobie", 0, 3600);
        assertEq(price4.base, 360, "foobie price should be 360");
    }

    function testShouldWorkWithLargerVolumes() public {
        // 1 USD per second
        uint256[] memory prices = new uint256[](5);
        prices[0] = 0;
        prices[1] = 0;
        prices[2] = 1000000000000000000; // 1 USD per second!
        prices[3] = 2;
        prices[4] = 1;

        StablePriceOracle priceOracle = new StablePriceOracle(
            AggregatorInterface(address(dummyOracle)),
            prices
        );

        IPriceOracle.Price memory price = priceOracle.price("foo", 0, 86400);
        assertEq(
            price.base,
            8640000000000000000000,
            "Large volume price should be 8640000000000000000000"
        );
    }
}
