// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title SetSubnodeRecord
 * @dev SetSubnodeRecord functionality tests for NameWrapper
 */
contract SetSubnodeRecord is BaseWrapperTest {
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE

    // Additional test accounts
    address constant NEW_OWNER = address(0x6);
    address constant RESOLVER = address(0x7);
    address constant OPERATOR = address(0x8);
    address constant UNAUTHORIZED = address(0x9);

    // Test domains
    string constant TEST_LABEL = "subdomain2";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE =
        keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);

    string constant CHILD_LABEL = "sub";
    bytes32 constant CHILD_LABEL_HASH = keccak256(bytes(CHILD_LABEL));
    bytes32 constant CHILD_NODE =
        keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
    uint256 constant CHILD_NODE_ID = uint256(CHILD_NODE);

    // Note: BaseWrapperTest provides DAY and MAX_EXPIRY constants
    // Note: BaseWrapperTest provides standard events: NameWrapped, NameUnwrapped, TransferSingle, etc.

    function setUp() public override {
        // Call parent setup - but need to override metadataService to use MockMetadataService
        vm.startPrank(OWNER);

        // Deploy core contracts with MockMetadataService for setSubnodeRecord tests
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
        baseRegistrar.register(TEST_LABEL_ID, OWNER, DAY);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with CANNOT_UNWRAP
        nameWrapper.wrapETH2LD(
            TEST_LABEL,
            OWNER,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordByOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Initially subdomain doesn't exist
        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            address(0),
            "Child should not exist initially"
        );
        assertEq(
            ens.owner(CHILD_NODE),
            address(0),
            "Child should not exist in ENS initially"
        );

        // Set subnode record
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100, // TTL
            0, // fuses
            0 // expiry
        );

        // Check subdomain is created and wrapped
        assertTrue(
            nameWrapper.isWrapped(CHILD_NODE),
            "Child should be wrapped"
        );
        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            NEW_OWNER,
            "Child should be owned by NEW_OWNER"
        );
        assertEq(
            ens.owner(CHILD_NODE),
            address(nameWrapper),
            "ENS should show wrapper as owner"
        );
        assertEq(ens.resolver(CHILD_NODE), RESOLVER, "Resolver should be set");
        assertEq(ens.ttl(CHILD_NODE), 100, "TTL should be set");

        vm.stopPrank();
    }

    function testSetSubnodeRecordByOperator() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();

        vm.startPrank(OPERATOR);

        // Set subnode record as approved operator
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        // Check subdomain is created
        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            NEW_OWNER,
            "Child should be owned by NEW_OWNER"
        );
        assertEq(ens.resolver(CHILD_NODE), RESOLVER, "Resolver should be set");

        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordByUnauthorized() public {
        _wrapTestDomain();

        vm.startPrank(UNAUTHORIZED);
        bytes32 childNode = keccak256(
            abi.encodePacked(TEST_NODE, keccak256(bytes(CHILD_LABEL)))
        );
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                UNAUTHORIZED
            )
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );
        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordToZeroAddress() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        vm.expectRevert("ERC1155: mint to the zero address");
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            address(0),
            RESOLVER,
            100,
            0,
            0
        );

        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordToWrapperAddress() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        vm.expectRevert("ERC1155: newOwner cannot be the NameWrapper contract");
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            address(nameWrapper),
            RESOLVER,
            100,
            0,
            0
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordWithFuses() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set subnode record with fuses
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
            MAX_EXPIRY
        );

        // Check fuses were set
        (, uint32 fuses, ) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(
            fuses & PARENT_CANNOT_CONTROL != 0,
            "Should have PARENT_CANNOT_CONTROL fuse"
        );
        assertTrue(
            fuses & CANNOT_UNWRAP != 0,
            "Should have CANNOT_UNWRAP fuse"
        );
        assertTrue(
            fuses & CANNOT_TRANSFER != 0,
            "Should have CANNOT_TRANSFER fuse"
        );

        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordFusesWithoutPCC() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Try to set fuses without PARENT_CANNOT_CONTROL - should fail
        bytes32 childNode = keccak256(
            abi.encodePacked(TEST_NODE, keccak256(bytes(CHILD_LABEL)))
        );
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", childNode)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            CANNOT_UNWRAP,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordFusesWithoutCannotUnwrap() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Try to set fuses without CANNOT_UNWRAP - should fail
        bytes32 childNode = keccak256(
            abi.encodePacked(TEST_NODE, keccak256(bytes(CHILD_LABEL)))
        );
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", childNode)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            PARENT_CANNOT_CONTROL | CANNOT_TRANSFER,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordIsDotEth() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Try to set IS_DOT_ETH fuse - should fail
        bytes32 childNode = keccak256(
            abi.encodePacked(TEST_NODE, keccak256(bytes(CHILD_LABEL)))
        );
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", childNode)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            PARENT_CANNOT_CONTROL |
                CANNOT_UNWRAP |
                CANNOT_TRANSFER |
                IS_DOT_ETH,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordExpiredFuses() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set subnode record with fuses but zero expiry (expired)
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
            0 // expired
        );

        // Check fuses are reset for expired domain
        (, uint32 fuses, uint64 expiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(fuses, 0, "Expired domain should have zero fuses");
        assertEq(expiry, 0, "Expired domain should have zero expiry");

        vm.stopPrank();
    }

    function testSetSubnodeRecordEmitsEvents() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        bytes memory expectedName = abi.encodePacked(
            uint8(3),
            CHILD_LABEL,
            uint8(10),
            TEST_LABEL,
            uint8(3),
            "eth",
            uint8(0)
        );

        // Expect TransferSingle event first
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(OWNER, address(0), NEW_OWNER, CHILD_NODE_ID, 1);

        // Expect NameWrapped event second
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(CHILD_NODE, expectedName, NEW_OWNER, 0, 0);

        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordChangesOwner() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain first
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            OWNER,
            "Should be owned by OWNER initially"
        );

        // Change owner
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            NEW_OWNER,
            "Should be owned by NEW_OWNER after change"
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordBurnAndUnwrap() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Create subdomain first
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            MAX_EXPIRY
        );

        assertTrue(
            nameWrapper.isWrapped(CHILD_NODE),
            "Should be wrapped initially"
        );
        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            NEW_OWNER,
            "Should be owned by NEW_OWNER"
        );

        // Expect NameUnwrapped event when setting owner to zero
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(CHILD_NODE, address(0));

        // Set owner to zero to burn and unwrap
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            address(0),
            address(0),
            0,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // Check subdomain is unwrapped
        assertFalse(nameWrapper.isWrapped(CHILD_NODE), "Should be unwrapped");
        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            address(0),
            "Should not be owned in wrapper"
        );

        vm.stopPrank();
    }

    function testCannotSetSubnodeRecordEmptyLabel() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        vm.expectRevert(abi.encodeWithSignature("LabelTooShort()"));
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            "",
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordSetsENSValues() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set subnode record with specific values
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        // Check ENS registry values
        assertEq(
            ens.owner(CHILD_NODE),
            address(nameWrapper),
            "ENS owner should be wrapper"
        );
        assertEq(
            ens.resolver(CHILD_NODE),
            RESOLVER,
            "ENS resolver should be set"
        );
        assertEq(ens.ttl(CHILD_NODE), 100, "ENS TTL should be set");

        vm.stopPrank();
    }

    function testSetSubnodeRecordWithZeroTTL() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set subnode record with zero TTL
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            0, // zero TTL
            0,
            0
        );

        // Check TTL is zero
        assertEq(ens.ttl(CHILD_NODE), 0, "TTL should be zero");

        vm.stopPrank();
    }

    function testSetSubnodeRecordWithZeroResolver() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set subnode record with zero resolver
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            address(0), // zero resolver
            100,
            0,
            0
        );

        // Check resolver is zero
        assertEq(
            ens.resolver(CHILD_NODE),
            address(0),
            "Resolver should be zero"
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordChangesBalances() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Check initial balances
        assertEq(
            nameWrapper.balanceOf(NEW_OWNER, CHILD_NODE_ID),
            0,
            "NEW_OWNER should not have token initially"
        );

        // Set subnode record
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        // Check balances after creation
        assertEq(
            nameWrapper.balanceOf(NEW_OWNER, CHILD_NODE_ID),
            1,
            "NEW_OWNER should have token"
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordNormalizesExpiry() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set subnode record with MAX_EXPIRY
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );

        // Check expiry is normalized to parent expiry
        (, , uint64 childExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        (, , uint64 parentExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(
            childExpiry,
            parentExpiry,
            "Child expiry should be normalized to parent expiry"
        );

        vm.stopPrank();
    }

    function testSetSubnodeRecordProtectedByCannotCreateSubdomain() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set CANNOT_CREATE_SUBDOMAIN fuse on parent
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_CREATE_SUBDOMAIN));

        // Try to create subdomain - should fail
        bytes32 childNode = keccak256(
            abi.encodePacked(TEST_NODE, keccak256(bytes(CHILD_LABEL)))
        );
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", childNode)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            0,
            0
        );

        vm.stopPrank();
    }

    function testRewrappingNameWithPCCBurnedButExpiredIsPossible() public {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        uint64 childExpiry = uint64(parentExpiry - DAY / 2);

        // Create subdomain with PCC and short expiry
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            RESOLVER,
            100,
            PARENT_CANNOT_CONTROL,
            childExpiry
        );

        vm.stopPrank();

        vm.startPrank(NEW_OWNER);

        // Unwrap the subdomain
        nameWrapper.unwrap(TEST_NODE, CHILD_LABEL_HASH, NEW_OWNER);

        vm.stopPrank();

        // Advance time so the subname expires, but not the parent
        vm.warp(block.timestamp + DAY / 2 + 1);

        vm.startPrank(OWNER);

        // Check that fuses are reset after expiry
        (, uint32 fusesAfterExpiry, uint64 expiryAfterExpiry) = nameWrapper
            .getData(CHILD_NODE_ID);
        assertEq(
            expiryAfterExpiry,
            childExpiry,
            "Expiry should remain the same"
        );
        assertEq(
            fusesAfterExpiry,
            0,
            "Fuses should be reset to 0 after expiry"
        );

        // Rewrap the subdomain - should succeed since PCC protection is gone after expiry
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            address(0),
            0,
            0,
            0
        );

        // Verify the subdomain was rewrapped successfully
        assertEq(
            nameWrapper.ownerOf(CHILD_NODE_ID),
            NEW_OWNER,
            "Subdomain should be rewrapped"
        );

        vm.stopPrank();
    }

    function testDoesNotAllowUnauthorizedUserEvenWithENSRegistryApproval()
        public
    {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        // Set ENS registry approval for unauthorized user
        ens.setApprovalForAll(UNAUTHORIZED, true);

        vm.stopPrank();

        vm.startPrank(UNAUTHORIZED);

        // Should fail even with ENS registry approval
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                TEST_NODE,
                UNAUTHORIZED
            )
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            RESOLVER,
            0,
            0,
            0
        );

        vm.stopPrank();
    }

    function testUnwrappingPreviouslyWrappedUnexpiredNameRetainsPCCAndRevertsSetSubnodeRecord()
        public
    {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID) +
            baseRegistrar.GRACE_PERIOD();

        // Create subdomain with PCC
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // Verify fuses are set
        (, uint32 fusesBefore, uint64 expiryBefore) = nameWrapper.getData(
            CHILD_NODE_ID
        );
        assertEq(fusesBefore, PARENT_CANNOT_CONTROL, "Should have PCC fuse");
        assertEq(expiryBefore, parentExpiry, "Should have parent expiry");

        vm.stopPrank();

        vm.startPrank(NEW_OWNER);

        // Unwrap the subdomain
        nameWrapper.unwrap(TEST_NODE, CHILD_LABEL_HASH, NEW_OWNER);

        vm.stopPrank();

        // Verify fuses are retained after unwrap for unexpired name
        (address owner, uint32 fusesAfter, uint64 expiryAfter) = nameWrapper
            .getData(CHILD_NODE_ID);
        assertEq(owner, address(0), "Owner should be zero after unwrap");
        assertEq(fusesAfter, PARENT_CANNOT_CONTROL, "PCC should be retained");
        assertEq(expiryAfter, parentExpiry, "Expiry should be retained");

        vm.startPrank(OWNER);

        // Attempt to rewrap with PCC still burnt - should fail
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", CHILD_NODE)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            address(0),
            0,
            0,
            0
        );

        vm.stopPrank();
    }

    function testExpiredSubnamesStillProtectedByCannotCreateSubdomainOnParent()
        public
    {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        uint64 childExpiry = uint64(parentExpiry - DAY / 2);

        string memory sublabel2 = "sub2";
        bytes32 sublabel2Hash = keccak256(bytes(sublabel2));
        bytes32 subnode2 = keccak256(
            abi.encodePacked(TEST_NODE, sublabel2Hash)
        );

        // Create first subdomain with short expiry
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            address(0),
            0,
            PARENT_CANNOT_CONTROL,
            childExpiry
        );

        // Set CANNOT_CREATE_SUBDOMAIN on parent
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_CREATE_SUBDOMAIN));

        // Should fail to create new subdomain due to CANNOT_CREATE_SUBDOMAIN
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", subnode2)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            sublabel2,
            NEW_OWNER,
            address(0),
            0,
            0,
            childExpiry
        );

        vm.stopPrank();

        // Advance time so the first subdomain expires
        vm.warp(block.timestamp + DAY / 2 + 1);

        // Verify first subdomain is expired
        (address owner, uint32 fuses, ) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, address(0), "First subdomain should be expired");
        assertEq(fuses, 0, "Fuses should be reset for expired domain");

        vm.startPrank(OWNER);

        // Should still fail to create subdomain even when first is expired
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", CHILD_NODE)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            address(0),
            0,
            0,
            childExpiry
        );

        vm.stopPrank();
    }

    function testBurningNameStillProtectsFromParentWhenUnexpiredWithPCC()
        public
    {
        _wrapTestDomain();

        vm.startPrank(OWNER);

        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID) +
            baseRegistrar.GRACE_PERIOD();

        // Create subdomain with PCC
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            NEW_OWNER,
            address(0),
            0,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // Verify fuses are set
        (, uint32 fusesBefore, ) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(fusesBefore, PARENT_CANNOT_CONTROL, "Should have PCC fuse");

        vm.stopPrank();

        vm.startPrank(NEW_OWNER);

        // Unwrap and burn the name in ENS registry
        nameWrapper.unwrap(TEST_NODE, CHILD_LABEL_HASH, NEW_OWNER);
        ens.setOwner(CHILD_NODE, address(0)); // Burn in ENS registry

        vm.stopPrank();

        // Verify name is burned but PCC protection remains
        (address owner, uint32 fusesAfter, uint64 expiryAfter) = nameWrapper
            .getData(CHILD_NODE_ID);
        assertEq(owner, address(0), "Owner should be zero");
        assertEq(fusesAfter, PARENT_CANNOT_CONTROL, "PCC should be retained");
        assertEq(expiryAfter, parentExpiry, "Should have parent expiry");
        assertEq(ens.owner(CHILD_NODE), address(0), "Should be burned in ENS");

        // Verify name is unexpired
        assertTrue(block.timestamp < expiryAfter, "Name should be unexpired");

        vm.startPrank(OWNER);

        // Attempt to take back the burned name - should fail due to PCC protection
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", CHILD_NODE)
        );
        nameWrapper.setSubnodeRecord(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            address(0),
            0,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }
}
