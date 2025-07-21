// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title GetApproved
 * @dev GetApproved functionality tests for NameWrapper
 */
contract GetApproved is BaseWrapperTest {
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE, DAY, MAX_EXPIRY

    // Test domains
    string constant TEST_LABEL = "subdomain";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE =
        keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);

    // Non-existent domain
    bytes32 constant UNMINTED_NODE = keccak256("unminted.eth");
    uint256 constant UNMINTED_NODE_ID = uint256(UNMINTED_NODE);

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

        // Wrap domain
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    function testGetApprovedReturnsZeroForUnmintedToken() public view {
        // Check getApproved for unminted token
        assertEq(
            nameWrapper.ownerOf(UNMINTED_NODE_ID),
            address(0),
            "Unminted token should have zero owner"
        );
        assertEq(
            nameWrapper.getApproved(UNMINTED_NODE_ID),
            address(0),
            "Unminted token should have zero approved"
        );
    }

    function testGetApprovedReturnsZeroInitially() public {
        _wrapTestDomain();

        // Initially no approval
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Should have no approval initially"
        );
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Should be owned by OWNER"
        );
    }

    function testGetApprovedReturnsApprovedAddress() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        // Check getApproved returns approved address
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should return approved address"
        );

        vm.stopPrank();
    }

    function testGetApprovedAfterApprovalChange() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set initial approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should return first approved address"
        );

        // Change approval
        nameWrapper.approve(OTHER, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            OTHER,
            "Should return new approved address"
        );

        vm.stopPrank();
    }

    function testGetApprovedAfterApprovalCleared() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should return approved address"
        );

        // Clear approval
        nameWrapper.approve(address(0), TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Should return zero address after clearing"
        );

        vm.stopPrank();
    }

    function testGetApprovedAfterTransfer() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should return approved address"
        );

        // Transfer token to OTHER
        nameWrapper.safeTransferFrom(OWNER, OTHER, TEST_NODE_ID, 1, "");

        // Approval should be cleared after transfer
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should be cleared after transfer"
        );
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OTHER,
            "OTHER should be new owner"
        );

        vm.stopPrank();
    }

    function testGetApprovedAfterUnwrap() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should return approved address"
        );

        // Unwrap the domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);

        // Approval should be cleared after unwrap
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should be cleared after unwrap"
        );
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            address(0),
            "Token should be burned after unwrap"
        );

        vm.stopPrank();
    }

    function testGetApprovedMultipleTokens() public {
        vm.startPrank(OWNER);

        // Register and wrap first domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Register and wrap second domain
        string memory label2 = "second";
        bytes32 label2Hash = keccak256(bytes(label2));
        uint256 label2Id = uint256(label2Hash);
        bytes32 node2 = keccak256(abi.encodePacked(ETH_NODE, label2Hash));
        uint256 node2Id = uint256(node2);

        baseRegistrar.register(label2Id, OWNER, 365 days);
        nameWrapper.wrapETH2LD(
            label2,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Set different approvals for each token
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        nameWrapper.approve(OTHER, node2Id);

        // Check each approval
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "First token should be approved to APPROVED"
        );
        assertEq(
            nameWrapper.getApproved(node2Id),
            OTHER,
            "Second token should be approved to OTHER"
        );

        vm.stopPrank();
    }

    function testGetApprovedWithApprovalForAll() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set approval for all
        nameWrapper.setApprovalForAll(OTHER, true);

        // getApproved should still return zero (approval for all is different)
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "getApproved should return zero even with approval for all"
        );

        // But isApprovedForAll should return true
        assertTrue(
            nameWrapper.isApprovedForAll(OWNER, OTHER),
            "Should be approved for all"
        );

        vm.stopPrank();
    }

    function testGetApprovedWithBothApprovals() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set both specific approval and approval for all
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        nameWrapper.setApprovalForAll(OTHER, true);

        // getApproved should return the specific approval
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should return specific approval"
        );
        assertTrue(
            nameWrapper.isApprovedForAll(OWNER, OTHER),
            "Should also be approved for all"
        );

        vm.stopPrank();
    }
}
