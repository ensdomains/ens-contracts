// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "contracts/ethregistrar/LinearPremiumPriceOracle.sol";
import "contracts/ethregistrar/IPriceOracle.sol";
import {AggregatorInterface} from "contracts/ethregistrar/StablePriceOracle.sol";

/**
 * @title TestLinearPremiumPriceOracle
 * @dev Complete LinearPremiumPriceOracle functionality tests
 */
contract TestLinearPremiumPriceOracle is BaseTest {
    // Note: BaseTest provides: ens, baseRegistrar, controller, linearPriceOracle, dummyOracle,
    // nameWrapper, metadataService, reverseRegistrar, publicResolver
    // and standard accounts: USER1, USER2, USER3
    // and constants: ZERO_HASH, ETH_NODE, REVERSE_NODE, DAY, REGISTRATION_TIME

    LinearPremiumPriceOracle public linearPriceOracle;
    DummyOracle public testDummyOracle;

    // Test accounts
    address public account0;
    address[] public accounts;

    // Constructor parameters for LinearPremiumPriceOracle
    uint256 constant INITIAL_PREMIUM = 100000000000000000000; // 100000000000000000000n
    uint256 constant PREMIUM_DECREASE_RATE = 1000000000000000; // 1000000000000000n

    function setUp() public override {
        super.setUp();

        // Set up accounts fixture
        account0 = address(0x1111);
        accounts.push(account0);

        // Warp forward to ensure we have enough time for arithmetic operations
        vm.warp(block.timestamp + 365 days);

        vm.startPrank(TestAccounts.owner());

        // Add account0 as controller for fixture setup test
        baseRegistrar.addController(account0);

        // Dummy oracle with 1 ETH == 2 USD (different from BaseTest's oracle)
        testDummyOracle = new DummyOracle(200000000); // 200000000n

        // Set up rent prices array
        uint256[] memory rentPrices = new uint256[](5);
        rentPrices[0] = 0; // 0n
        rentPrices[1] = 0; // 0n
        rentPrices[2] = 4; // 4n
        rentPrices[3] = 2; // 2n
        rentPrices[4] = 1; // 1n

        // 4 attousd per second for 3 character names, 2 attousd per second for 4 character names,
        // 1 attousd per second for longer names.
        // Pricing premium starts out at 100 USD at expiry and decreases to 0 over 100k seconds (a bit over a day)
        linearPriceOracle = new LinearPremiumPriceOracle(
            AggregatorInterface(address(testDummyOracle)),
            rentPrices,
            INITIAL_PREMIUM, // 100000000000000000000n
            PREMIUM_DECREASE_RATE // 1000000000000000n
        );

        vm.stopPrank();
    }

    // TEST 1: "should report the correct premium and decrease rate"
    function testShouldReportTheCorrectPremiumAndDecreaseRate() public {
        uint256 initialPremium = linearPriceOracle.initialPremium();
        assertEq(
            initialPremium,
            INITIAL_PREMIUM,
            "Initial premium should match constructor parameter"
        );

        uint256 decreaseRate = linearPriceOracle.premiumDecreaseRate();
        assertEq(
            decreaseRate,
            PREMIUM_DECREASE_RATE,
            "Premium decrease rate should match constructor parameter"
        );
    }

    // TEST 2: "should return correct base prices"
    function testShouldReturnCorrectBasePrices() public {
        IPriceOracle.Price memory priceResult1 = linearPriceOracle.price(
            "foo",
            0,
            3600
        );
        uint256 base1 = priceResult1.base;
        assertEq(base1, 7200, "foo should have base price 7200");

        IPriceOracle.Price memory priceResult2 = linearPriceOracle.price(
            "quux",
            0,
            3600
        );
        uint256 base2 = priceResult2.base;
        assertEq(base2, 3600, "quux should have base price 3600");

        IPriceOracle.Price memory priceResult3 = linearPriceOracle.price(
            "fubar",
            0,
            3600
        );
        uint256 base3 = priceResult3.base;
        assertEq(base3, 1800, "fubar should have base price 1800");

        IPriceOracle.Price memory priceResult4 = linearPriceOracle.price(
            "foobie",
            0,
            3600
        );
        uint256 base4 = priceResult4.base;
        assertEq(base4, 1800, "foobie should have base price 1800");
    }

    // TEST 3: "should not specify a premium for first-time registrations"
    function testShouldNotSpecifyAPremiumForFirstTimeRegistrations() public {
        uint256 premium1 = linearPriceOracle.premium("foobar", 0, 0);
        assertEq(
            premium1,
            0,
            "Premium should be 0 for first-time registration"
        );

        IPriceOracle.Price memory priceResult5 = linearPriceOracle.price(
            "foobar",
            0,
            0
        );
        uint256 base = priceResult5.base;
        assertEq(base, 0, "Base price should be 0 for 0 duration");
    }

    // TEST 4: "should not specify a premium for renewals"
    function testShouldNotSpecifyAPremiumForRenewals() public {
        uint256 timestamp = block.timestamp;

        uint256 premium = linearPriceOracle.premium("foobar", timestamp, 0);
        assertEq(premium, 0, "Premium should be 0 for renewals");

        IPriceOracle.Price memory priceResult6 = linearPriceOracle.price(
            "foobar",
            timestamp,
            0
        );
        uint256 base = priceResult6.base;
        assertEq(base, 0, "Base price should be 0 for 0 duration renewal");
    }

    // TEST 5: "should specify the maximum premium at the moment of expiration"
    function testShouldSpecifyTheMaximumPremiumAtTheMomentOfExpiration()
        public
    {
        vm.warp(block.timestamp + 365 * DAY); // Warp forward to have enough time
        uint256 timestamp = block.timestamp - 90 * DAY;

        uint256 premium = linearPriceOracle.premium("foobar", timestamp, 0);
        assertEq(
            premium,
            50000000000000000000,
            "Premium should be 50 ETH at moment of expiration"
        );

        IPriceOracle.Price memory priceResultA = linearPriceOracle.price(
            "foobar",
            timestamp,
            0
        );
        uint256 premiumFromPrice = priceResultA.premium;
        assertEq(
            premiumFromPrice,
            50000000000000000000,
            "Premium from price() should be 50 ETH"
        );
    }

    // TEST 6: "should specify half the premium after half the interval"
    function testShouldSpecifyHalfThePremiumAfterHalfTheInterval() public {
        uint256 timestamp = block.timestamp - (90 * DAY + 50000);

        uint256 premium = linearPriceOracle.premium("foobar", timestamp, 0);
        assertEq(
            premium,
            25000000000000000000,
            "Premium should be 25 ETH after half the interval"
        );

        IPriceOracle.Price memory priceResultB = linearPriceOracle.price(
            "foobar",
            timestamp,
            0
        );
        uint256 premiumFromPrice = priceResultB.premium;
        assertEq(
            premiumFromPrice,
            25000000000000000000,
            "Premium from price() should be 25 ETH"
        );
    }

    // TEST 7: "should return correct times for price queries"
    function testShouldReturnCorrectTimesForPriceQueries() public {
        uint256 initialPremiumWei = 50000000000000000000;

        uint256 timeUntilInitialPremium = linearPriceOracle.timeUntilPremium(
            0,
            initialPremiumWei
        );
        assertEq(
            timeUntilInitialPremium,
            90 * DAY,
            "Time until initial premium should be 90 days"
        );

        uint256 timeUntilZeroPremium = linearPriceOracle.timeUntilPremium(0, 0);
        assertEq(
            timeUntilZeroPremium,
            90 * DAY + 100000,
            "Time until zero premium should be 90 days + 100000 seconds"
        );
    }

    // Additional tests to ensure complete functionality

    function testCompleteFixtureSetup() public {
        assertTrue(
            address(ens) != address(0),
            "ENS Registry should be deployed"
        );
        assertTrue(
            address(baseRegistrar) != address(0),
            "Base Registrar should be deployed"
        );
        assertTrue(
            address(linearPriceOracle) != address(0),
            "Price Oracle should be deployed"
        );
        assertTrue(
            address(dummyOracle) != address(0),
            "Dummy Oracle should be deployed"
        );

        // Verify accounts setup
        assertEq(accounts.length, 1, "Should have 1 account");
        assertEq(accounts[0], account0, "First account should match");

        // Verify controller setup
        assertTrue(
            baseRegistrar.controllers(account0),
            "Account0 should be controller"
        );

        // Verify ENS setup
        assertEq(
            ens.owner(ETH_NODE),
            address(baseRegistrar),
            "Base registrar should own .eth node"
        );

        // Verify oracle setup
        assertEq(
            testDummyOracle.latestAnswer(),
            200000000,
            "Test dummy oracle should return 2 USD per ETH"
        );
    }

    function testLinearDecayCalculation() public {
        // Test the linear decay calculation at various time points
        vm.warp(block.timestamp + 365 * DAY); // Warp forward to have enough time
        uint256 expiredTime = block.timestamp - 90 * DAY;

        // Test at different intervals to verify linear decay
        uint256[] memory testOffsets = new uint256[](5);
        testOffsets[0] = 0; // At expiry
        testOffsets[1] = 25000; // 25k seconds after expiry
        testOffsets[2] = 50000; // 50k seconds after expiry (half way)
        testOffsets[3] = 75000; // 75k seconds after expiry
        testOffsets[4] = 100000; // 100k seconds after expiry (end)

        uint256[] memory expectedPremiums = new uint256[](5);
        expectedPremiums[0] = 50000000000000000000; // 50 ETH (initial premium / 2 due to USD conversion)
        expectedPremiums[1] = 25000000000000000000; // 25 ETH
        expectedPremiums[2] = 25000000000000000000; // 25 ETH
        expectedPremiums[3] = 12500000000000000000; // 12.5 ETH
        expectedPremiums[4] = 0; // 0 ETH

        for (uint256 i = 0; i < testOffsets.length; i++) {
            uint256 premium = linearPriceOracle.premium(
                "test",
                expiredTime - testOffsets[i],
                0
            );

            if (i == 2) {
                assertEq(
                    premium,
                    expectedPremiums[i],
                    "Premium should match at 50k seconds"
                );
            } else if (i == 4) {
                // At the end, premium should be 0
                assertEq(premium, 0, "Premium should be 0 after decay period");
            } else {
                // Other points should follow linear decay pattern
                assertTrue(
                    premium <= expectedPremiums[0],
                    "Premium should not exceed initial premium"
                );
                if (i > 0) {
                    uint256 prevPremium = linearPriceOracle.premium(
                        "test",
                        expiredTime - testOffsets[i - 1],
                        0
                    );
                    assertTrue(
                        premium <= prevPremium,
                        "Premium should decrease over time"
                    );
                }
            }
        }
    }

    function testPriceCalculationComponents() public {
        // Test individual price calculation components

        // Test base price calculation for different name lengths
        IPriceOracle.Price memory priceResult8 = linearPriceOracle.price(
            "foo",
            0,
            3600
        ); // 3 chars
        uint256 base3 = priceResult8.base;
        IPriceOracle.Price memory priceResult9 = linearPriceOracle.price(
            "test",
            0,
            3600
        ); // 4 chars
        uint256 base4 = priceResult9.base;
        IPriceOracle.Price memory priceResult10 = linearPriceOracle.price(
            "testing",
            0,
            3600
        ); // 7 chars
        uint256 base5 = priceResult10.base;

        // 3 char: 4 attousd/sec * 3600 sec * 2 (USD to ETH) = 7200
        assertEq(base3, 7200, "3 character names should cost 4 attousd/sec");

        // 4 char: 2 attousd/sec * 3600 sec * 2 (USD to ETH) = 3600
        assertEq(base4, 3600, "4 character names should cost 2 attousd/sec");

        // 5+ char: 1 attousd/sec * 3600 sec * 2 (USD to ETH) = 1800
        assertEq(base5, 1800, "5+ character names should cost 1 attousd/sec");
    }

    function testPremiumCalculationEdgeCases() public {
        vm.warp(block.timestamp + 365 * DAY); // Warp forward to have enough time
        uint256 expiredTimestamp = block.timestamp - 200 * DAY; // Very old expiry

        // Test premium for very expired names (beyond decay period)
        uint256 veryOldPremium = linearPriceOracle.premium(
            "test",
            expiredTimestamp,
            0
        );
        assertEq(
            veryOldPremium,
            0,
            "Very old expired names should have 0 premium"
        );

        // Test premium exactly at expiry time
        uint256 currentTimestamp = block.timestamp;
        uint256 premiumAtExpiry = linearPriceOracle.premium(
            "test",
            currentTimestamp,
            0
        );
        assertEq(
            premiumAtExpiry,
            0,
            "Names not yet expired should have 0 premium"
        );

        // Test premium just after expiry (within grace period but before linear decay starts)
        uint256 recentExpiry = block.timestamp - DAY; // Expired 1 day ago
        uint256 recentPremium = linearPriceOracle.premium(
            "test",
            recentExpiry,
            0
        );
        assertEq(
            recentPremium,
            0,
            "Names in grace period should have 0 premium before linear decay starts"
        );
    }

    function testTimeUntilPremiumCalculations() public {
        // Test time until premium calculations with various premium amounts

        // Test with premium equal to half the initial premium
        uint256 halfInitialPremium = 25000000000000000000; // 25 ETH
        uint256 timeUntilHalf = linearPriceOracle.timeUntilPremium(
            0,
            halfInitialPremium
        );

        // This should be 90 days + 50000 seconds (when premium reaches 25 ETH)
        assertEq(
            timeUntilHalf,
            90 * DAY + 50000,
            "Time until half premium should be 90 days + 50000 seconds"
        );

        // Test with premium equal to quarter of initial premium
        uint256 quarterInitialPremium = 12500000000000000000; // 12.5 ETH
        uint256 timeUntilQuarter = linearPriceOracle.timeUntilPremium(
            0,
            quarterInitialPremium
        );

        // This should be 90 days + 75000 seconds
        assertEq(
            timeUntilQuarter,
            90 * DAY + 75000,
            "Time until quarter premium should be 90 days + 75000 seconds"
        );

        // Test with premium equal to initial (should return grace period)
        uint256 initialPremium = 50000000000000000000; // 50 ETH (100 USD at $2/ETH)
        uint256 timeUntilInitial = linearPriceOracle.timeUntilPremium(
            0,
            initialPremium
        );

        // This should be just the grace period (90 days) since this is when decay starts
        assertEq(
            timeUntilInitial,
            90 * DAY,
            "Time until initial premium should be grace period"
        );
    }

    function testZeroDurationHandling() public {
        // Test zero duration scenarios
        IPriceOracle.Price memory priceResult11 = linearPriceOracle.price(
            "test",
            0,
            0
        );
        uint256 base = priceResult11.base;
        uint256 premium = priceResult11.premium;
        assertEq(base, 0, "Zero duration should have zero base price");
        assertEq(premium, 0, "Zero duration should have zero premium");

        // Test with expired timestamp but zero duration
        vm.warp(block.timestamp + 365 * DAY); // Warp forward if not already done
        // Name expired 91 days ago (90 day grace + 1 day into decay period)
        uint256 expiredTime = block.timestamp - 91 * DAY;
        uint256 premiumZeroDuration = linearPriceOracle.premium(
            "test",
            expiredTime,
            0
        );
        assertGt(
            premiumZeroDuration,
            0,
            "Expired names should still have premium even with zero registration duration"
        );
    }

    function testLargeDurationHandling() public {
        // Test very large duration
        uint256 largeDuration = 365 * DAY * 10; // 10 years
        IPriceOracle.Price memory priceResult12 = linearPriceOracle.price(
            "test",
            0,
            largeDuration
        );
        uint256 base = priceResult12.base;

        // 4 char name: 2 attousd/sec * largeDuration / 2 (USD to ETH conversion at $2/ETH)
        // 2 attousd/sec * 315360000 sec / 2 = 315360000
        uint256 expectedBase = (2 * largeDuration) / 2;
        assertEq(
            base,
            expectedBase,
            "Large duration should scale base price correctly"
        );
    }

    function testDecayPeriodBoundaries() public {
        // Test exact boundaries of the linear decay period
        vm.warp(block.timestamp + 365 * DAY); // Warp forward to have enough time
        uint256 expiredTime = block.timestamp - 90 * DAY;

        // Test at start of decay period (90 days after expiry)
        uint256 premiumAtStart = linearPriceOracle.premium(
            "test",
            expiredTime,
            0
        );
        assertEq(
            premiumAtStart,
            50000000000000000000,
            "Premium should be at maximum at start of decay"
        );

        // Test at end of decay period (90 days + 100k seconds after expiry)
        uint256 premiumAtEnd = linearPriceOracle.premium(
            "test",
            expiredTime - 100000,
            0
        );
        assertEq(premiumAtEnd, 0, "Premium should be 0 at end of decay period");

        // Test just before end of decay period
        uint256 premiumBeforeEnd = linearPriceOracle.premium(
            "test",
            expiredTime - 99999,
            0
        );
        assertGt(
            premiumBeforeEnd,
            0,
            "Premium should be > 0 just before end of decay period"
        );
    }

    function testMultipleNameLengths() public {
        // Test all different name length categories
        string[7] memory testNames = [
            "a",
            "ab",
            "abc",
            "abcd",
            "abcde",
            "abcdef",
            "abcdefg"
        ];
        uint256[7] memory expectedRates = [uint256(0), 0, 4, 2, 1, 1, 1]; // attousd per second

        for (uint256 i = 0; i < testNames.length; i++) {
            IPriceOracle.Price memory priceResult = linearPriceOracle.price(
                testNames[i],
                0,
                3600
            );
            uint256 base = priceResult.base;
            uint256 expectedBase = (expectedRates[i] * 3600) / 2; // rate * duration / USD_to_ETH_conversion ($2/ETH)
            assertEq(
                base,
                expectedBase,
                string(
                    abi.encodePacked(
                        "Name length ",
                        vm.toString(i + 1),
                        " should have correct base price"
                    )
                )
            );
        }
    }

    function testLinearDecayFormula() public {
        // Test that the linear decay follows the expected formula
        // Premium = initialPremium - (time_since_decay_start * decreaseRate)
        // Where initialPremium = 100 ETH, decreaseRate = 1000000000000000 wei per second
        // And we convert to USD: premium_in_wei = (premium_usd * 1e18) / oracle_price

        vm.warp(block.timestamp + 365 * DAY); // Warp forward to have enough time
        // Grace period is 90 days, so decay starts 90 days after expiration
        // Set expiration time such that decay starts now
        uint256 nameExpiredTime = block.timestamp - 90 * DAY; // Name expired 90 days ago
        // Now we're at the start of linear decay period

        // Test at various time points
        uint256[] memory testTimes = new uint256[](4);
        testTimes[0] = 0; // At start of decay (now)
        testTimes[1] = 10000; // 10k seconds into decay
        testTimes[2] = 50000; // 50k seconds into decay
        testTimes[3] = 90000; // 90k seconds into decay

        for (uint256 i = 0; i < testTimes.length; i++) {
            uint256 timeIntoDecay = testTimes[i];
            // For testing, we simulate being at different points in the decay by warping forward
            vm.warp(block.timestamp + timeIntoDecay);
            uint256 premium = linearPriceOracle.premium(
                "test",
                nameExpiredTime,
                0
            );
            // Warp back to avoid affecting subsequent tests
            vm.warp(block.timestamp - timeIntoDecay);

            // Calculate expected premium using the linear formula
            // Initial premium in USD is 100, converted to ETH at $2 per ETH = 50 ETH = 50e18 wei
            // Decrease rate is 1000000000000000 attoUSD per second
            // After USD->ETH conversion: 1000000000000000 * 1e8 / 200000000 = 500000000000000 wei per second = 0.0005 ETH per second
            uint256 expectedPremium = 50000000000000000000; // 50 ETH
            uint256 decreaseRateInWei = 500000000000000; // 0.0005 ETH per second in wei
            if (timeIntoDecay * decreaseRateInWei < expectedPremium) {
                expectedPremium =
                    expectedPremium -
                    (timeIntoDecay * decreaseRateInWei);
            } else {
                expectedPremium = 0;
            }

            assertEq(
                premium,
                expectedPremium,
                string(
                    abi.encodePacked(
                        "Premium should follow linear decay formula at time ",
                        vm.toString(timeIntoDecay)
                    )
                )
            );
        }
    }
}
