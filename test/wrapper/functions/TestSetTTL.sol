// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title SetTTL
 * @dev SetTTL functionality tests for NameWrapper
 */
contract SetTTL is BaseWrapperTest {
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE, DAY, MAX_EXPIRY

    // Additional address for this test
    address constant UNAUTHORIZED = address(0x5);

    // Test domains
    string constant TEST_LABEL = "setttl";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE =
        keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);

    function setUp() public override {
        super.setUp();

        // Set up default domain constants
        defaultLabel = "test";
        _setupDefaultDomain();
    }

    function _wrapTestDomain() internal {
        vm.startPrank(OWNER);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with CANNOT_UNWRAP to enable other fuses
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        vm.stopPrank();
    }

    function testSetTTLByOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Initially TTL should be 0
        assertEq(ens.ttl(TEST_NODE), 0, "Should have TTL of 0 initially");

        // Set TTL
        uint64 newTTL = 3600;
        nameWrapper.setTTL(TEST_NODE, newTTL);

        // Check TTL was set
        assertEq(ens.ttl(TEST_NODE), newTTL, "TTL should be set");

        vm.stopPrank();
    }

    function testSetTTLByOperator() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OTHER, true);
        vm.stopPrank();

        vm.startPrank(OTHER);

        // Set TTL as operator
        uint64 newTTL = 7200;
        nameWrapper.setTTL(TEST_NODE, newTTL);

        // Check TTL was set
        assertEq(ens.ttl(TEST_NODE), newTTL, "TTL should be set by operator");

        vm.stopPrank();
    }

    function testSetTTLByUnauthorized() public {
        _wrapTestDomain();

        vm.startPrank(UNAUTHORIZED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                UNAUTHORIZED
            )
        );
        nameWrapper.setTTL(TEST_NODE, 3600);
        vm.stopPrank();
    }

    function testSetTTLToZero() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // First set a non-zero TTL
        nameWrapper.setTTL(TEST_NODE, 3600);
        assertEq(ens.ttl(TEST_NODE), 3600, "TTL should be set");

        // Set TTL to zero
        nameWrapper.setTTL(TEST_NODE, 0);
        assertEq(ens.ttl(TEST_NODE), 0, "TTL should be zero");

        vm.stopPrank();
    }

    function testSetTTLToMaxValue() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set TTL to maximum uint64 value
        uint64 maxTTL = type(uint64).max;
        nameWrapper.setTTL(TEST_NODE, maxTTL);

        // Check TTL was set
        assertEq(ens.ttl(TEST_NODE), maxTTL, "TTL should be set to max value");

        vm.stopPrank();
    }

    function testSetTTLMultipleTimes() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        uint64[] memory ttlValues = new uint64[](4);
        ttlValues[0] = 300; // 5 minutes
        ttlValues[1] = 3600; // 1 hour
        ttlValues[2] = 86400; // 1 day
        ttlValues[3] = 604800; // 1 week

        for (uint i = 0; i < ttlValues.length; i++) {
            nameWrapper.setTTL(TEST_NODE, ttlValues[i]);
            assertEq(ens.ttl(TEST_NODE), ttlValues[i], "TTL should be updated");
        }

        vm.stopPrank();
    }

    function testCannotSetTTLWithCannotSetTTLFuse() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_SET_TTL fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_SET_TTL));

        // Try to set TTL - should fail
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE)
        );
        nameWrapper.setTTL(TEST_NODE, 3600);

        vm.stopPrank();
    }

    function testSetTTLAfterBurningOtherFuses() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set other fuses (not CANNOT_SET_TTL)
        nameWrapper.setFuses(
            TEST_NODE,
            uint16(CANNOT_TRANSFER | CANNOT_SET_RESOLVER)
        );

        // Should still be able to set TTL
        uint64 newTTL = 3600;
        nameWrapper.setTTL(TEST_NODE, newTTL);
        assertEq(
            ens.ttl(TEST_NODE),
            newTTL,
            "Should be able to set TTL with other fuses burned"
        );

        vm.stopPrank();
    }

    function testCannotSetTTLOnExpiredDomain() public {
        _wrapTestDomain();

        // Advance time past expiry + grace period
        uint256 registrationExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        vm.warp(registrationExpiry + baseRegistrar.GRACE_PERIOD() + 1);

        vm.startPrank(OWNER);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                OWNER
            )
        );
        nameWrapper.setTTL(TEST_NODE, 3600);
        vm.stopPrank();
    }

    function testCannotSetTTLOnUnwrappedDomain() public {
        vm.startPrank(OWNER);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain without CANNOT_UNWRAP so we can unwrap it
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Unwrap domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);

        // Try to set TTL through wrapper - should fail
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                OWNER
            )
        );
        nameWrapper.setTTL(TEST_NODE, 3600);

        vm.stopPrank();
    }

    function testSetTTLForSubdomain() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain
        string memory subLabel = "sub";
        bytes32 subNode = nameWrapper.setSubnodeOwner(
            TEST_NODE,
            subLabel,
            OWNER,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );

        // Set TTL for subdomain
        uint64 subTTL = 1800;
        nameWrapper.setTTL(subNode, subTTL);
        assertEq(ens.ttl(subNode), subTTL, "Subdomain TTL should be set");

        vm.stopPrank();
    }

    function testSetTTLWithApproval() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Approve OTHER for specific token
        nameWrapper.approve(OTHER, TEST_NODE_ID);

        vm.stopPrank();

        vm.startPrank(OTHER);

        // Approved address cannot set TTL (approval is only for limited operations)
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                OTHER
            )
        );
        nameWrapper.setTTL(TEST_NODE, 3600);

        vm.stopPrank();
    }

    function testSetTTLUpdatesDNSRecord() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Test that setting TTL updates the ENS registry record
        uint64 initialTTL = ens.ttl(TEST_NODE);
        assertEq(initialTTL, 0, "Initial TTL should be zero");

        uint64 newTTL = 3600;
        nameWrapper.setTTL(TEST_NODE, newTTL);

        uint64 updatedTTL = ens.ttl(TEST_NODE);
        assertEq(updatedTTL, newTTL, "TTL should be updated in ENS registry");
        assertNotEq(updatedTTL, initialTTL, "TTL should have changed");

        vm.stopPrank();
    }

    function testSetTTLConsistency() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set TTL and verify it's returned consistently
        uint64 ttl1 = 1800;
        nameWrapper.setTTL(TEST_NODE, ttl1);
        assertEq(ens.ttl(TEST_NODE), ttl1, "TTL should be consistent");

        uint64 ttl2 = 7200;
        nameWrapper.setTTL(TEST_NODE, ttl2);
        assertEq(ens.ttl(TEST_NODE), ttl2, "Updated TTL should be consistent");

        vm.stopPrank();
    }

    function testSetTTLPreservesOtherRecord() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set resolver and TTL
        address resolver = address(0x123);
        nameWrapper.setResolver(TEST_NODE, resolver);
        nameWrapper.setTTL(TEST_NODE, 3600);

        // Verify both are set
        assertEq(
            ens.resolver(TEST_NODE),
            resolver,
            "Resolver should be preserved"
        );
        assertEq(ens.ttl(TEST_NODE), 3600, "TTL should be set");

        // Change TTL, verify resolver is preserved
        nameWrapper.setTTL(TEST_NODE, 7200);
        assertEq(
            ens.resolver(TEST_NODE),
            resolver,
            "Resolver should still be preserved"
        );
        assertEq(ens.ttl(TEST_NODE), 7200, "TTL should be updated");

        vm.stopPrank();
    }
}
