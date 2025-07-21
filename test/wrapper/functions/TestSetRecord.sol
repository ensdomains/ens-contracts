// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title SetRecord
 * @dev SetRecord functionality tests for NameWrapper
 */
contract SetRecord is BaseWrapperTest {
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE, DAY, MAX_EXPIRY

    // Additional addresses for this test
    address constant NEW_OWNER = address(0x5);
    address constant RESOLVER = address(0x6);
    address constant UNAUTHORIZED = address(0x7);

    // Test domains
    string constant TEST_LABEL = "setrecord";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE =
        keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);

    string constant SUB_LABEL = "sub";
    bytes32 constant SUB_LABEL_HASH = keccak256(bytes(SUB_LABEL));
    bytes32 constant SUB_NODE =
        keccak256(abi.encodePacked(TEST_NODE, SUB_LABEL_HASH));
    uint256 constant SUB_NODE_ID = uint256(SUB_NODE);

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

    function testSetRecordByOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set record (owner, resolver, TTL)
        uint64 newTTL = 3600;
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, newTTL);

        // Check all record fields were set
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            NEW_OWNER,
            "Owner should be transferred"
        );
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Resolver should be set");
        assertEq(ens.ttl(TEST_NODE), newTTL, "TTL should be set");

        vm.stopPrank();
    }

    function testSetRecordByOperator() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OTHER, true);
        vm.stopPrank();

        vm.startPrank(OTHER);

        // Set record as operator
        uint64 newTTL = 7200;
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, newTTL);

        // Check all record fields were set
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            NEW_OWNER,
            "Owner should be transferred by operator"
        );
        assertEq(
            ens.resolver(TEST_NODE),
            RESOLVER,
            "Resolver should be set by operator"
        );
        assertEq(ens.ttl(TEST_NODE), newTTL, "TTL should be set by operator");

        vm.stopPrank();
    }

    function testSetRecordByUnauthorized() public {
        _wrapTestDomain();

        vm.startPrank(UNAUTHORIZED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                UNAUTHORIZED
            )
        );
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, 3600);
        vm.stopPrank();
    }

    function testCannotSetRecordWithCannotTransferFuse() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_TRANSFER fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_TRANSFER));

        // Try to set record - should fail because it transfers ownership
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE)
        );
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, 3600);

        vm.stopPrank();
    }

    function testCannotSetRecordWithCannotSetResolverFuse() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_SET_RESOLVER fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_SET_RESOLVER));

        // Try to set record - should fail because it sets resolver
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE)
        );
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, 3600);

        vm.stopPrank();
    }

    function testCannotSetRecordWithCannotSetTTLFuse() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_SET_TTL fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_SET_TTL));

        // Try to set record - should fail because it sets TTL
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE)
        );
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, 3600);

        vm.stopPrank();
    }

    function testSetRecordToSameOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set record to same owner (should work)
        uint64 newTTL = 3600;
        nameWrapper.setRecord(TEST_NODE, OWNER, RESOLVER, newTTL);

        // Check resolver and TTL were set, owner unchanged
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Owner should remain the same"
        );
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Resolver should be set");
        assertEq(ens.ttl(TEST_NODE), newTTL, "TTL should be set");

        vm.stopPrank();
    }

    function testSetRecordWithZeroValues() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set record with zero resolver and TTL
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, address(0), 0);

        // Check values were set
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            NEW_OWNER,
            "Owner should be transferred"
        );
        assertEq(
            ens.resolver(TEST_NODE),
            address(0),
            "Resolver should be zero"
        );
        assertEq(ens.ttl(TEST_NODE), 0, "TTL should be zero");

        vm.stopPrank();
    }

    function testCannotSetETH2LDOwnerToZero() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Try to set .eth domain owner to zero - should fail
        vm.expectRevert(
            abi.encodeWithSignature("IncorrectTargetOwner(address)", address(0))
        );
        nameWrapper.setRecord(TEST_NODE, address(0), RESOLVER, 3600);

        vm.stopPrank();
    }

    function testSetSubdomainOwnerToZeroUnwraps() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            OWNER,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );

        // Verify subdomain is wrapped
        assertTrue(
            nameWrapper.isWrapped(SUB_NODE),
            "Subdomain should be wrapped"
        );
        assertEq(
            nameWrapper.ownerOf(SUB_NODE_ID),
            OWNER,
            "Should own subdomain"
        );

        // Set subdomain owner to zero - should unwrap
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(SUB_NODE, address(0));

        nameWrapper.setRecord(SUB_NODE, address(0), RESOLVER, 3600);

        // Verify subdomain is unwrapped
        assertFalse(
            nameWrapper.isWrapped(SUB_NODE),
            "Subdomain should be unwrapped"
        );
        assertEq(
            nameWrapper.ownerOf(SUB_NODE_ID),
            address(0),
            "Wrapper should not own subdomain"
        );
        assertEq(ens.owner(SUB_NODE), address(0), "ENS should have zero owner");
        assertEq(ens.resolver(SUB_NODE), RESOLVER, "Resolver should be set");
        assertEq(ens.ttl(SUB_NODE), 3600, "TTL should be set");

        vm.stopPrank();
    }

    function testCannotSetSubdomainOwnerToZeroWithCannotUnwrapFuse() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain with CANNOT_UNWRAP
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            OWNER,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // Try to set subdomain owner to zero - should fail with CANNOT_UNWRAP
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", SUB_NODE)
        );
        nameWrapper.setRecord(SUB_NODE, address(0), RESOLVER, 3600);

        vm.stopPrank();
    }

    function testCannotSetRecordOnExpiredDomain() public {
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
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, 3600);
        vm.stopPrank();
    }

    function testSetRecordPreservesUnchangedFields() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // First set some values
        nameWrapper.setResolver(TEST_NODE, address(0x123));
        nameWrapper.setTTL(TEST_NODE, 1800);

        // Use setRecord to only change owner
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, address(0x123), 1800);

        // Verify all fields are as expected
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            NEW_OWNER,
            "Owner should be changed"
        );
        assertEq(
            ens.resolver(TEST_NODE),
            address(0x123),
            "Resolver should be preserved"
        );
        assertEq(ens.ttl(TEST_NODE), 1800, "TTL should be preserved");

        vm.stopPrank();
    }

    function testSetRecordUpdatesAllFields() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // First set some initial values
        nameWrapper.setResolver(TEST_NODE, address(0x111));
        nameWrapper.setTTL(TEST_NODE, 900);

        // Use setRecord to change everything
        address newResolver = address(0x222);
        uint64 newTTL = 1800;
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, newResolver, newTTL);

        // Verify all fields were updated
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            NEW_OWNER,
            "Owner should be updated"
        );
        assertEq(
            ens.resolver(TEST_NODE),
            newResolver,
            "Resolver should be updated"
        );
        assertEq(ens.ttl(TEST_NODE), newTTL, "TTL should be updated");

        vm.stopPrank();
    }

    function testSetRecordTransfersToken() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Check initial balances
        assertEq(
            nameWrapper.balanceOf(OWNER, TEST_NODE_ID),
            1,
            "OWNER should have token"
        );
        assertEq(
            nameWrapper.balanceOf(NEW_OWNER, TEST_NODE_ID),
            0,
            "NEW_OWNER should not have token"
        );

        // Set record to transfer ownership
        nameWrapper.setRecord(TEST_NODE, NEW_OWNER, RESOLVER, 3600);

        // Check balances after transfer
        assertEq(
            nameWrapper.balanceOf(OWNER, TEST_NODE_ID),
            0,
            "OWNER should not have token"
        );
        assertEq(
            nameWrapper.balanceOf(NEW_OWNER, TEST_NODE_ID),
            1,
            "NEW_OWNER should have token"
        );

        vm.stopPrank();
    }
}
