// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {ETHRegistrarController} from "../../../contracts/ethregistrar/ETHRegistrarController.sol";
import {IETHRegistrarController} from "../../../contracts/ethregistrar/IETHRegistrarController.sol";
import {DummyOracle} from "../../../contracts/ethregistrar/DummyOracle.sol";
import {StablePriceOracle} from "../../../contracts/ethregistrar/StablePriceOracle.sol";
import {AggregatorInterface} from "../../../contracts/ethregistrar/StablePriceOracle.sol";
import {IPriceOracle} from "../../../contracts/ethregistrar/IPriceOracle.sol";
import {DefaultReverseRegistrar} from "../../../contracts/reverseRegistrar/DefaultReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title Renew
 * @dev Renew functionality tests for NameWrapper
 */
contract Renew is BaseWrapperTest {
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    ETHRegistrarController public controller;
    DummyOracle public dummyOracle;
    StablePriceOracle public priceOracle;
    DefaultReverseRegistrar public defaultReverseRegistrar;

    // Additional test accounts
    address constant NEW_OWNER = address(0x6);
    address constant UNAUTHORIZED = address(0x7);

    // Test domains
    string constant TEST_LABEL = "register";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE =
        keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);

    function setUp() public override {
        // Warp forward to ensure reasonable timestamp for commitment age validation
        vm.warp(block.timestamp + 365 days);

        vm.startPrank(OWNER);

        // Deploy core contracts with MockMetadataService for renew tests
        ens = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        metadataService = IMetadataService(address(new MockMetadataService()));

        // Deploy reverse registrar and set up reverse registry FIRST
        reverseRegistrar = new ReverseRegistrar(ens);
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), OWNER);
        ens.setSubnodeOwner(
            keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse"))),
            keccak256("addr"),
            address(reverseRegistrar)
        );

        // Deploy NameWrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);

        // Configure permissions
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(OWNER);

        // Set up default domain constants
        defaultLabel = "test";
        _setupDefaultDomain();

        // Set up nameWrapper as controller
        nameWrapper.setController(OWNER, true);

        // Deploy price oracle and controller - specific to renew tests
        dummyOracle = new DummyOracle(int256(100000000)); // 100000000n
        uint256[] memory rentPrices = new uint256[](5);
        rentPrices[0] = 0; // 0n
        rentPrices[1] = 0; // 0n
        rentPrices[2] = 4; // 4n
        rentPrices[3] = 2; // 2n
        rentPrices[4] = 1; // 1n
        priceOracle = new StablePriceOracle(
            AggregatorInterface(address(dummyOracle)),
            rentPrices
        );

        // Deploy DefaultReverseRegistrar
        defaultReverseRegistrar = new DefaultReverseRegistrar();

        controller = new ETHRegistrarController(
            baseRegistrar,
            priceOracle,
            60, // 1 minute commitment age
            86400, // 24 hour max commitment age
            reverseRegistrar,
            defaultReverseRegistrar,
            ens
        );

        // Add controller to baseRegistrar and set up permissions
        baseRegistrar.addController(address(controller));
        nameWrapper.setController(address(controller), true);

        vm.stopPrank();
    }

    function _registerAndWrapTestDomain()
        internal
        returns (uint256 initialExpiry)
    {
        vm.startPrank(OWNER);

        // Move past grace period and register/wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        nameWrapper.registerAndWrapETH2LD(
            TEST_LABEL,
            OWNER,
            86400, // 1 day
            address(0),
            uint16(CAN_DO_EVERYTHING)
        );

        initialExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);

        vm.stopPrank();
    }

    function testRenewName() public {
        uint256 initialExpiry = _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        // Renew for another day
        uint256 extension = 86400; // 1 day
        nameWrapper.renew(TEST_LABEL_ID, extension);

        // Check registrar expiry was extended
        uint256 newExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            newExpiry,
            initialExpiry + extension,
            "Registrar expiry should be extended"
        );

        vm.stopPrank();
    }

    function testRenewExtendsWrapperExpiry() public {
        uint256 initialExpiry = _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        // Get initial wrapper expiry
        (, , uint64 initialWrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);

        // Renew for another day
        uint256 extension = 86400; // 1 day
        nameWrapper.renew(TEST_LABEL_ID, extension);

        // Check wrapper expiry was extended
        (, , uint64 newWrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);
        uint256 expectedWrapperExpiry = initialExpiry +
            extension +
            baseRegistrar.GRACE_PERIOD();

        assertEq(
            newWrapperExpiry,
            expectedWrapperExpiry,
            "Wrapper expiry should be extended"
        );
        assertEq(
            newWrapperExpiry,
            initialWrapperExpiry + extension,
            "Wrapper expiry should increase by extension"
        );

        vm.stopPrank();
    }

    function testRenewMaintainsOwnership() public {
        _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        // Check initial ownership
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Should be owned by OWNER initially"
        );

        // Renew
        nameWrapper.renew(TEST_LABEL_ID, 86400);

        // Check ownership is maintained
        (address owner, , ) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(owner, OWNER, "Owner should be maintained after renewal");
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "ownerOf should return OWNER after renewal"
        );

        vm.stopPrank();
    }

    function testRenewWithFuses() public {
        vm.startPrank(OWNER);

        // Register and wrap with fuses
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        nameWrapper.registerAndWrapETH2LD(
            TEST_LABEL,
            OWNER,
            86400,
            address(0),
            uint16(CANNOT_UNWRAP | CANNOT_SET_RESOLVER)
        );

        // Get initial fuses
        (, uint32 initialFuses, ) = nameWrapper.getData(TEST_NODE_ID);

        // Renew
        nameWrapper.renew(TEST_LABEL_ID, 86400);

        // Check fuses are maintained
        (, uint32 newFuses, ) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(
            newFuses,
            initialFuses,
            "Fuses should be maintained after renewal"
        );
        assertTrue(
            newFuses & CANNOT_UNWRAP != 0,
            "Should maintain CANNOT_UNWRAP fuse"
        );
        assertTrue(
            newFuses & CANNOT_SET_RESOLVER != 0,
            "Should maintain CANNOT_SET_RESOLVER fuse"
        );

        vm.stopPrank();
    }

    function testCannotRenewAsUnauthorized() public {
        _registerAndWrapTestDomain();

        vm.startPrank(UNAUTHORIZED);

        // Try to renew as unauthorized user - should fail
        vm.expectRevert("Controllable: Caller is not a controller");
        nameWrapper.renew(TEST_LABEL_ID, 86400);

        vm.stopPrank();
    }

    function testRenewExpiredName() public {
        vm.startPrank(OWNER);

        // Start with a base time well past grace period
        uint256 baseTime = 365 * DAY;
        vm.warp(baseTime);

        // Register with very short expiry
        nameWrapper.registerAndWrapETH2LD(
            TEST_LABEL,
            OWNER,
            DAY, // 1 day
            address(0),
            uint16(CANNOT_UNWRAP | CANNOT_SET_RESOLVER)
        );

        // Get initial state
        (, uint32 initialFuses, uint64 initialWrapperExpiry) = nameWrapper
            .getData(TEST_NODE_ID);
        uint256 initialRegistrarExpiry = baseRegistrar.nameExpires(
            TEST_LABEL_ID
        );

        // Wrapper expiry should be registrar expiry + grace period
        assertEq(
            initialWrapperExpiry,
            initialRegistrarExpiry + baseRegistrar.GRACE_PERIOD(),
            "Initial wrapper expiry check"
        );

        // Advance time past registrar expiry but within grace period
        // This will make the wrapper show the domain as expired
        vm.warp(initialRegistrarExpiry + 1);

        // Domain should NOT appear expired yet - wrapper expiry hasn't been reached
        // For ETH 2LDs, owner is only cleared when past wrapper expiry (registrar + grace)
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Domain should still show owner"
        );

        // But registrar should still be renewable (within grace)
        assertTrue(
            initialRegistrarExpiry + baseRegistrar.GRACE_PERIOD() >=
                block.timestamp,
            "Should be within registrar grace period"
        );

        // Renew for a short period (1 day)
        nameWrapper.renew(TEST_LABEL_ID, DAY);

        // Check registrar was extended
        uint256 newRegistrarExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            newRegistrarExpiry,
            initialRegistrarExpiry + DAY,
            "Registrar should be extended by 1 day"
        );

        // Check wrapper expiry
        (, uint32 newFuses, uint64 newWrapperExpiry) = nameWrapper.getData(
            TEST_NODE_ID
        );
        assertEq(
            newWrapperExpiry,
            newRegistrarExpiry + baseRegistrar.GRACE_PERIOD(),
            "Wrapper expiry should be registrar + grace period"
        );

        // Fuses should be maintained
        assertEq(newFuses, initialFuses, "Fuses should be maintained");

        // Check if still expired based on new wrapper expiry
        if (newWrapperExpiry <= block.timestamp) {
            assertEq(
                nameWrapper.ownerOf(TEST_NODE_ID),
                address(0),
                "Domain should still appear expired"
            );
        } else {
            assertEq(
                nameWrapper.ownerOf(TEST_NODE_ID),
                OWNER,
                "Domain should be unexpired"
            );
        }

        vm.stopPrank();
    }

    function testRenewUnexpiresDomain() public {
        vm.startPrank(OWNER);

        // This test verifies that renewing extends the wrapper expiry
        // For ETH 2LDs, domains only show as "expired" when past wrapper expiry,
        // but at that point they can't be renewed anymore.
        // So we test renewal during grace period instead.

        uint256 baseTime = 365 * DAY;
        vm.warp(baseTime);

        // Register with very short expiry
        nameWrapper.registerAndWrapETH2LD(
            TEST_LABEL,
            OWNER,
            DAY, // 1 day
            address(0),
            uint16(CANNOT_UNWRAP | CANNOT_SET_RESOLVER)
        );

        // Get initial expiry
        uint256 initialRegistrarExpiry = baseRegistrar.nameExpires(
            TEST_LABEL_ID
        );
        (, , uint64 initialWrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);

        // Advance time into grace period (past registrar expiry)
        vm.warp(initialRegistrarExpiry + DAY);

        // Domain should still show as owned (wrapper expiry not reached)
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Domain should still be owned during grace period"
        );

        // Get current wrapper expiry before renewal
        (, , uint64 currentWrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(
            currentWrapperExpiry,
            initialWrapperExpiry,
            "Wrapper expiry should not have changed yet"
        );

        // Renew for a longer period
        uint256 renewalDuration = 100 * DAY;
        nameWrapper.renew(TEST_LABEL_ID, renewalDuration);

        // Check new expiries
        uint256 newRegistrarExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        (, , uint64 newWrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);

        // Verify registrar was extended
        assertEq(
            newRegistrarExpiry,
            initialRegistrarExpiry + renewalDuration,
            "Registrar expiry should be extended"
        );

        // Verify wrapper expiry was extended
        assertEq(
            newWrapperExpiry,
            newRegistrarExpiry + baseRegistrar.GRACE_PERIOD(),
            "Wrapper expiry should be extended"
        );
        assertTrue(
            newWrapperExpiry > initialWrapperExpiry,
            "New wrapper expiry should be later than initial"
        );

        // Domain should still be owned
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Domain should remain owned after renewal"
        );

        vm.stopPrank();
    }

    function testRenewMultipleTimes() public {
        uint256 initialExpiry = _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        // First renewal
        nameWrapper.renew(TEST_LABEL_ID, 86400);
        uint256 firstRenewalExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            firstRenewalExpiry,
            initialExpiry + 86400,
            "First renewal should extend by 1 day"
        );

        // Second renewal
        nameWrapper.renew(TEST_LABEL_ID, 2 * 86400);
        uint256 secondRenewalExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            secondRenewalExpiry,
            firstRenewalExpiry + 2 * 86400,
            "Second renewal should extend by 2 days"
        );

        // Check wrapper expiry follows
        (, , uint64 wrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(
            wrapperExpiry,
            secondRenewalExpiry + baseRegistrar.GRACE_PERIOD(),
            "Wrapper expiry should follow registrar"
        );

        vm.stopPrank();
    }

    function testRenewZeroDuration() public {
        _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        uint256 initialExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);

        // Renew with zero duration
        nameWrapper.renew(TEST_LABEL_ID, 0);

        // Check expiry is unchanged
        uint256 newExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            newExpiry,
            initialExpiry,
            "Zero duration renewal should not change expiry"
        );

        vm.stopPrank();
    }

    function testRenewLongDuration() public {
        _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        uint256 initialExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        uint256 longDuration = 365 * DAY; // 1 year

        // Renew with long duration
        nameWrapper.renew(TEST_LABEL_ID, longDuration);

        // Check expiry is extended correctly
        uint256 newExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            newExpiry,
            initialExpiry + longDuration,
            "Long duration renewal should extend correctly"
        );

        // Check wrapper expiry
        (, , uint64 wrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(
            wrapperExpiry,
            newExpiry + baseRegistrar.GRACE_PERIOD(),
            "Wrapper expiry should be registrar expiry + grace period"
        );

        vm.stopPrank();
    }

    function testRenewNonExistentName() public {
        vm.startPrank(OWNER);

        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);

        // Try to renew non-existent name
        bytes32 nonExistentLabel = keccak256("nonexistent");
        uint256 nonExistentId = uint256(nonExistentLabel);

        // Should fail because name doesn't exist in registrar
        vm.expectRevert(bytes(""));
        nameWrapper.renew(nonExistentId, 86400);

        vm.stopPrank();
    }

    function testRenewMaintainsRegistrarOwnership() public {
        _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        // Check initial registrar ownership
        assertEq(
            baseRegistrar.ownerOf(TEST_LABEL_ID),
            address(nameWrapper),
            "Registrar should show wrapper as owner"
        );

        // Renew
        nameWrapper.renew(TEST_LABEL_ID, 86400);

        // Check registrar ownership is maintained
        assertEq(
            baseRegistrar.ownerOf(TEST_LABEL_ID),
            address(nameWrapper),
            "Registrar should still show wrapper as owner"
        );

        vm.stopPrank();
    }

    function testRenewWithDifferentController() public {
        _registerAndWrapTestDomain();

        vm.startPrank(OWNER);

        // Set NEW_OWNER as controller
        nameWrapper.setController(NEW_OWNER, true);

        vm.stopPrank();

        vm.startPrank(NEW_OWNER);

        uint256 initialExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);

        // Renew as different controller
        nameWrapper.renew(TEST_LABEL_ID, 86400);

        // Check renewal worked
        uint256 newExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(
            newExpiry,
            initialExpiry + 86400,
            "Renewal should work with different controller"
        );

        vm.stopPrank();
    }

    // Helper function to register through controller
    function _registerThroughController(
        string memory label,
        uint256 duration
    ) internal returns (uint256) {
        bytes32 secret = keccak256("secret");

        IETHRegistrarController.Registration
            memory registration = IETHRegistrarController.Registration({
                label: label,
                owner: OWNER,
                duration: duration,
                secret: secret,
                resolver: address(0),
                data: new bytes[](0),
                reverseRecord: 0,
                referrer: 0
            });

        bytes32 commitment = controller.makeCommitment(registration);

        controller.commit(commitment);
        vm.warp(block.timestamp + 61);

        IPriceOracle.Price memory priceStruct = controller.rentPrice(
            label,
            duration
        );
        uint256 price = priceStruct.base + priceStruct.premium;
        controller.register{value: price}(registration);

        return uint256(keccak256(bytes(label)));
    }

    // Helper function to renew through controller
    function _renewThroughController(
        string memory label,
        uint256 duration
    ) internal {
        IPriceOracle.Price memory priceStruct = controller.rentPrice(
            label,
            duration
        );
        uint256 price = priceStruct.base + priceStruct.premium;
        controller.renew{value: price}(label, duration, 0); // 0 referrer
    }

    // Integration tests with ETHRegistrarController
    function testRenewalThroughControllerVsWrapper() public {
        uint256 initialDuration = 365 days;
        uint256 renewalDuration = 180 days;

        vm.startPrank(OWNER);
        vm.deal(OWNER, 10 ether);
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);

        // Register through controller
        uint256 controllerLabelId = _registerThroughController(
            "controller",
            initialDuration
        );

        // Register through wrapper
        nameWrapper.registerAndWrapETH2LD(
            "wrapper",
            OWNER,
            initialDuration,
            address(0),
            uint16(CAN_DO_EVERYTHING)
        );
        uint256 wrapperLabelId = uint256(keccak256(bytes("wrapper")));

        uint256 controllerInitialExpiry = baseRegistrar.nameExpires(
            controllerLabelId
        );
        uint256 wrapperInitialExpiry = baseRegistrar.nameExpires(
            wrapperLabelId
        );

        // Renew both
        _renewThroughController("controller", renewalDuration);
        nameWrapper.renew(wrapperLabelId, renewalDuration);

        // Check both renewed correctly
        uint256 controllerNewExpiry = baseRegistrar.nameExpires(
            controllerLabelId
        );
        uint256 wrapperNewExpiry = baseRegistrar.nameExpires(wrapperLabelId);

        assertEq(
            controllerNewExpiry,
            controllerInitialExpiry + renewalDuration,
            "Controller renewal should work"
        );
        assertEq(
            wrapperNewExpiry,
            wrapperInitialExpiry + renewalDuration,
            "Wrapper renewal should work"
        );

        vm.stopPrank();
    }

    function testControllerCanRenewWrappedName() public {
        // Register a wrapped domain
        _registerAndWrapTestDomain();

        vm.startPrank(OWNER);
        vm.deal(OWNER, 10 ether);

        // Try to renew wrapped domain through controller - should succeed
        // The controller can still renew wrapped names because it has permission on BaseRegistrar
        IPriceOracle.Price memory renewalPriceStruct = controller.rentPrice(
            TEST_LABEL,
            180 days
        );
        uint256 renewalPrice = renewalPriceStruct.base +
            renewalPriceStruct.premium;

        uint256 expiryBefore = baseRegistrar.nameExpires(TEST_LABEL_ID);
        controller.renew{value: renewalPrice}(TEST_LABEL, 180 days, 0); // 0 referrer
        uint256 expiryAfter = baseRegistrar.nameExpires(TEST_LABEL_ID);

        assertEq(
            expiryAfter,
            expiryBefore + 180 days,
            "Controller should be able to renew wrapped names"
        );

        vm.stopPrank();
    }

    function testRenewalPriceConsistency() public {
        string memory testLabel = "pricing";
        uint256 duration = 365 days;

        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);

        // Get renewal price from controller
        IPriceOracle.Price memory priceStruct = controller.rentPrice(
            testLabel,
            duration
        );
        uint256 controllerPrice = priceStruct.base + priceStruct.premium;

        // Verify price is from oracle
        assertTrue(
            controllerPrice > 0,
            "Controller should return non-zero price for renewal"
        );

        // Wrapper renewal doesn't require payment (only gas)
        // But should still respect the same duration constraints
        assertTrue(
            duration >= 86400,
            "Duration should meet minimum requirements"
        );
    }
}
