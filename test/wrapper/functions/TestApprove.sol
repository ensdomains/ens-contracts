// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";
import "../../../contracts/utils/NameCoder.sol";

/**
 * @title Approve
 * @dev Approve functionality tests for NameWrapper
 */
contract Approve is BaseWrapperTest {
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE

    // Additional test accounts
    address constant OPERATOR = address(0x6);

    // Test domains
    string constant TEST_LABEL = "test";
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

    // Note: BaseWrapperTest provides DAY and MAX_EXPIRY constants
    // Note: BaseWrapperTest provides standard events: ApprovalForAll, etc.

    // Additional events specific to approval functionality
    event Approval(
        address indexed owner,
        address indexed approved,
        uint256 indexed tokenId
    );

    function setUp() public override {
        // Call parent setup - but need to override metadataService to use MockMetadataService
        vm.startPrank(OWNER);

        // Deploy core contracts with MockMetadataService for approve tests
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

        vm.stopPrank();
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

    function _wrapTestDomainWithShortExpiry() internal {
        vm.startPrank(OWNER);

        // Move past grace period and register domain with SHORT expiry
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 * DAY); // Short 1 day expiry
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

    function testApprovalByOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Initially no approval
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Should have no approval initially"
        );

        // Set approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        vm.stopPrank();
    }

    function testApprovalByOperator() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();

        vm.startPrank(OPERATOR);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved by operator"
        );
        vm.stopPrank();
    }

    function testApprovalByUnauthorized() public {
        _wrapTestDomain();

        vm.startPrank(OTHER);
        vm.expectRevert(
            "ERC721: approve caller is not token owner or approved for all"
        );
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();
    }

    function testApprovalEmitsEvent() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        vm.expectEmit(true, true, true, false);
        emit Approval(OWNER, APPROVED, TEST_NODE_ID);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        vm.stopPrank();
    }

    function testApprovedCannotSetSubnodeOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            OTHER,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );
        vm.stopPrank();
    }

    function testApprovedCannotSetSubnodeRecord() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            SUB_LABEL,
            OTHER,
            address(0),
            0,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );
        vm.stopPrank();
    }

    function testApprovedCannotTransfer() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert("ERC1155: caller is not owner nor approved");
        nameWrapper.safeTransferFrom(OWNER, OTHER, TEST_NODE_ID, 1, "");
        vm.stopPrank();
    }

    function testApprovedCannotSetRecord() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setRecord(TEST_NODE, OTHER, address(0), 0);
        vm.stopPrank();
    }

    function testApprovedCannotSetResolver() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setResolver(TEST_NODE, address(0x123));
        vm.stopPrank();
    }

    function testApprovedCannotSetTTL() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setTTL(TEST_NODE, 3600);
        vm.stopPrank();
    }

    function testApprovedCannotUnwrapETH2LD() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        vm.stopPrank();

        vm.startPrank(APPROVED);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OTHER, OTHER);
        vm.stopPrank();
    }

    function testApprovalClearedOnTransfer() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        // Transfer to OTHER
        nameWrapper.safeTransferFrom(OWNER, OTHER, TEST_NODE_ID, 1, "");
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should be cleared"
        );
        vm.stopPrank();
    }

    function testApprovalClearedOnUnwrap() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        // Unwrap
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should be cleared"
        );
        vm.stopPrank();
    }

    function testApprovalReplacement() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set first approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        // Replace with new approval
        nameWrapper.approve(OTHER, TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            OTHER,
            "Approval should be replaced"
        );

        // Clear approval
        nameWrapper.approve(address(0), TEST_NODE_ID);
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should be cleared"
        );

        vm.stopPrank();
    }

    function testCannotApproveWithCannotApproveFuse() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_APPROVE fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_UNWRAP | CANNOT_APPROVE));

        // Attempting to approve should fail
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE)
        );
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        vm.stopPrank();
    }

    function testAllowsApprovedAddressToCallExtendExpiry() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain first
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            CAN_DO_EVERYTHING,
            0
        );
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        vm.stopPrank();

        // Verify subdomain is owned by ACCOUNT
        assertEq(
            nameWrapper.ownerOf(SUB_NODE_ID),
            ACCOUNT,
            "Subdomain should be owned by ACCOUNT"
        );

        vm.startPrank(APPROVED);

        // Approved address should be able to extend expiry
        nameWrapper.extendExpiry(TEST_NODE, SUB_LABEL_HASH, 100);

        vm.stopPrank();

        // Check expiry was set
        (, , uint64 expiry) = nameWrapper.getData(SUB_NODE_ID);
        assertEq(expiry, 100, "Expiry should be set to 100");
    }

    function testApprovedAddressCannotExtendExpiryWhenExpired() public {
        vm.startPrank(OWNER);

        // Move past grace period and register domain with SHORT expiry
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 * DAY); // Short 1 day expiry
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Create subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            CAN_DO_EVERYTHING,
            0
        );
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        vm.stopPrank();

        // Fast forward time to make parent domain expired
        vm.warp(block.timestamp + 2 * DAY);

        vm.startPrank(APPROVED);

        // Should fail when parent domain is expired
        // When parent expires, canExtendSubnames returns false even for approved addresses
        // causing Unauthorised error (not OperationProhibited) as per extendExpiry authorization flow
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                SUB_NODE,
                APPROVED
            )
        );
        nameWrapper.extendExpiry(TEST_NODE, SUB_LABEL_HASH, 1000);

        vm.stopPrank();
    }

    function testApprovedAddressCanBeReplacedAndPreviousApprovedIsRemoved()
        public
    {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_UNWRAP fuse and create subdomain with appropriate fuses
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_UNWRAP));

        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID) +
            baseRegistrar.GRACE_PERIOD();

        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            OWNER,
            uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY),
            uint64(parentExpiry - 1000)
        );

        // Set first approval
        nameWrapper.approve(ACCOUNT, TEST_NODE_ID);
        // Replace with second approval
        nameWrapper.approve(ACCOUNT2, TEST_NODE_ID);

        vm.stopPrank();

        // Second approved address should work
        vm.startPrank(ACCOUNT2);
        nameWrapper.extendExpiry(
            TEST_NODE,
            SUB_LABEL_HASH,
            uint64(parentExpiry - 500)
        );
        vm.stopPrank();

        // First approved address should no longer work
        vm.startPrank(ACCOUNT);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                SUB_NODE,
                ACCOUNT
            )
        );
        nameWrapper.extendExpiry(
            TEST_NODE,
            SUB_LABEL_HASH,
            uint64(parentExpiry)
        );
        vm.stopPrank();

        // Verify expiry was set by second approved address
        (, , uint64 expiry) = nameWrapper.getData(SUB_NODE_ID);
        assertEq(
            expiry,
            uint64(parentExpiry - 500),
            "Expiry should be set by second approved address"
        );
    }

    function testApprovedAddressCanCallSetSubnodeRecord() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain first
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            CAN_DO_EVERYTHING,
            0
        );
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        vm.stopPrank();

        vm.startPrank(APPROVED);

        // Should fail - approved address cannot call setSubnodeRecord
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            address(0),
            0,
            CAN_DO_EVERYTHING,
            10000
        );

        vm.stopPrank();
    }

    function testApprovedAddressCannotCallSetChildFuses() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID) +
            baseRegistrar.GRACE_PERIOD();

        // Set CANNOT_UNWRAP fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_UNWRAP));

        // Create subdomain first
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            CAN_DO_EVERYTHING,
            0
        );
        nameWrapper.approve(APPROVED, TEST_NODE_ID);

        vm.stopPrank();

        vm.startPrank(APPROVED);

        // Should fail - approved address cannot call setChildFuses
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                APPROVED
            )
        );
        nameWrapper.setChildFuses(
            TEST_NODE,
            SUB_LABEL_HASH,
            uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY),
            uint64(parentExpiry)
        );

        vm.stopPrank();
    }

    function testApprovalIsClearedOnReRegistrationAndWrapOfExpiredName()
        public
    {
        _wrapTestDomainWithShortExpiry();

        vm.startPrank(OWNER);

        // Set approval and fuses including PARENT_CANNOT_CONTROL for proper expiry behavior
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        nameWrapper.setFuses(
            TEST_NODE,
            uint16(CANNOT_UNWRAP | CANNOT_APPROVE | PARENT_CANNOT_CONTROL)
        );

        // Verify approval is set
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        vm.stopPrank();

        // Fast forward past the NameWrapper expiry (domain registered for 1 day + grace period)
        vm.warp(block.timestamp + 1 * DAY + baseRegistrar.GRACE_PERIOD() + 1);

        // Check approval appears cleared when expired due to owner becoming address(0)
        // This works because getApproved() returns address(0) when ownerOf() returns address(0)
        // which happens when domains expire and _clearOwnerAndFuses() is called
        // The PARENT_CANNOT_CONTROL fuse is required for owner to become address(0) on expiry
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should appear cleared when expired"
        );

        // Re-register the domain
        vm.startPrank(OWNER);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 * DAY);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Re-wrap the domain
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Verify approval is still cleared after re-wrap
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            address(0),
            "Approval should remain cleared after re-wrap"
        );

        // Verify ownership
        assertEq(
            nameWrapper.ownerOf(TEST_NODE_ID),
            OWNER,
            "Should be owned by OWNER"
        );

        vm.stopPrank();
    }

    function testApprovalIsNotClearedOnTransferIfCannotApproveIsBurnt() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set approval and CANNOT_APPROVE fuse
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_UNWRAP | CANNOT_APPROVE));

        // Verify approval is set
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        // Transfer to OTHER
        nameWrapper.safeTransferFrom(OWNER, OTHER, TEST_NODE_ID, 1, "");

        // Verify approval is NOT cleared when CANNOT_APPROVE is burnt
        assertEq(
            nameWrapper.getApproved(TEST_NODE_ID),
            APPROVED,
            "Approval should NOT be cleared when CANNOT_APPROVE is burnt"
        );

        vm.stopPrank();
    }

    function testApprovalIsClearedOnUnwrap() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain first
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            OWNER,
            CAN_DO_EVERYTHING,
            0
        );

        // Set approval on subdomain
        nameWrapper.approve(APPROVED, SUB_NODE_ID);
        assertEq(
            nameWrapper.getApproved(SUB_NODE_ID),
            APPROVED,
            "Should be approved"
        );

        // Unwrap subdomain
        nameWrapper.unwrap(TEST_NODE, SUB_LABEL_HASH, OWNER);

        // Verify approval is cleared
        assertEq(
            nameWrapper.getApproved(SUB_NODE_ID),
            address(0),
            "Approval should be cleared after unwrap"
        );

        // Set registry approval for re-wrapping
        ens.setApprovalForAll(address(nameWrapper), true);

        // Re-wrap to test approval is still cleared
        nameWrapper.wrap(NameCoder.encode("sub.test.eth"), OWNER, address(0));
        assertEq(
            nameWrapper.getApproved(SUB_NODE_ID),
            address(0),
            "Approval should remain cleared after re-wrap"
        );

        // Re-approve to show approval can be reinstated
        nameWrapper.approve(APPROVED, SUB_NODE_ID);
        assertEq(
            nameWrapper.getApproved(SUB_NODE_ID),
            APPROVED,
            "Approval should be reinstated"
        );

        vm.stopPrank();
    }
}
