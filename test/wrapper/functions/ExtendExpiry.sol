// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {INameWrapper, CANNOT_UNWRAP, CANNOT_BURN_FUSES, CANNOT_TRANSFER, CANNOT_SET_RESOLVER, CANNOT_SET_TTL, CANNOT_CREATE_SUBDOMAIN, CANNOT_APPROVE, PARENT_CANNOT_CONTROL, CAN_DO_EVERYTHING, IS_DOT_ETH, CAN_EXTEND_EXPIRY} from "../../../contracts/wrapper/INameWrapper.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title ExtendExpiry
 * @dev ExtendExpiry functionality tests for NameWrapper
 */
contract ExtendExpiry is Test {
    
    NameWrapper public nameWrapper;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;
    
    // Test accounts
    address constant OWNER = address(0x1);
    address constant CHILD_OWNER = address(0x2);
    address constant OPERATOR = address(0x3);
    address constant UNAUTHORIZED = address(0x4);
    
    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE = keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    
    // Test domains
    string constant TEST_LABEL = "fuses";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
    string constant CHILD_LABEL = "sub";
    bytes32 constant CHILD_LABEL_HASH = keccak256(bytes(CHILD_LABEL));
    bytes32 constant CHILD_NODE = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
    uint256 constant CHILD_NODE_ID = uint256(CHILD_NODE);
    
    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;
    
    // Events
    event ExpiryExtended(bytes32 indexed node, uint64 expiry);
    
    function setUp() public {
        vm.startPrank(OWNER);
        
        // Deploy core contracts
        ens = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        metadataService = IMetadataService(address(new MockMetadataService()));
        
        // Deploy reverse registrar
        reverseRegistrar = new ReverseRegistrar(ens);
        
        // Set up reverse registry
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), OWNER);
        ens.setSubnodeOwner(keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse"))), keccak256("addr"), address(reverseRegistrar));
        
        // Deploy name wrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);
        
        // Set up domain structure
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(OWNER);
        
        vm.stopPrank();
    }
    
    function _wrapParentWithChild() internal returns (uint256 parentExpiry) {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with PARENT_CANNOT_CONTROL and CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600)
        );
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByParentOwner() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Check initial expiry
        (, , uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry should be parentExpiry - 3600");
        
        // Extend expiry as parent owner
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByChildOwner() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(CHILD_OWNER);
        
        // Check initial expiry
        (, , uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry should be parentExpiry - 3600");
        
        // Extend expiry as child owner (should work with CAN_EXTEND_EXPIRY)
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByOperator() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();
        
        vm.startPrank(OPERATOR);
        
        // Extend expiry as approved operator of parent
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryByUnauthorized() public {
        _wrapParentWithChild();
        
        vm.startPrank(UNAUTHORIZED);
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", childNode, UNAUTHORIZED));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryWithoutCanExtendExpiryFuse() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain without CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(parentExpiry - 3600)
        );
        
        vm.stopPrank();
        
        vm.startPrank(CHILD_OWNER);
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryOfETH2LD() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        (, , uint64 expiry) = nameWrapper.getData(TEST_NODE_ID);
        
        // Try to extend expiry of .eth 2LD - should fail
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE));
        nameWrapper.extendExpiry(ETH_NODE, TEST_LABEL_HASH, expiry);
        
        vm.stopPrank();
    }
    
    function testExtendExpiryNormalizesToOldExpiry() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(CHILD_OWNER);
        
        // Check initial expiry
        (, , uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry should be parentExpiry - 3600");
        
        // Try to extend to a time before current expiry
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, uint64(parentExpiry - 3601));
        
        // Should remain at old expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry - 3600, "Expiry should remain unchanged");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryNormalizesToParentExpiry() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(CHILD_OWNER);
        
        // Try to extend beyond parent expiry + grace period
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, uint64(parentExpiry + baseRegistrar.GRACE_PERIOD() + 1));
        
        // Should be capped at parent expiry + grace period
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "Expiry should be capped at parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryToSpecificTime() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(CHILD_OWNER);
        
        uint64 targetExpiry = uint64(parentExpiry - 1800); // 30 minutes before parent expiry
        
        // Extend to specific time within valid range
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, targetExpiry);
        
        // Should be set to exact target time
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, targetExpiry, "Expiry should be set to target time");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryOfUnregisteredName() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Try to extend expiry of non-existent subdomain
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, keccak256("nonexistent"), MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryOfExpiredChild() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with short expiry
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY,
            uint64(block.timestamp + 3600)
        );
        
        // Advance time past child expiry
        vm.warp(block.timestamp + 3601);
        
        vm.stopPrank();
        
        vm.startPrank(CHILD_OWNER);
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        vm.stopPrank();
    }
    
    function testExtendExpiryEmitsEvent() public {
        uint256 parentExpiry = _wrapParentWithChild();
        
        vm.startPrank(CHILD_OWNER);
        
        // Expect ExpiryExtended event
        vm.expectEmit(true, false, false, true);
        emit ExpiryExtended(CHILD_NODE, uint64(parentExpiry + baseRegistrar.GRACE_PERIOD()));
        
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testExtendExpiryAfterParentExpiry() public {
        vm.startPrank(OWNER);
        
        // Register domain with short expiry
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry + baseRegistrar.GRACE_PERIOD() - 3600)
        );
        
        // Advance time past parent expiry but within grace period
        vm.warp(parentExpiry + 1);
        
        vm.stopPrank();
        
        // Parent owner should not be able to extend expiry after parent expires
        vm.startPrank(OWNER);
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", childNode, OWNER));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        vm.stopPrank();
        
        // But child owner should still be able to extend
        vm.startPrank(CHILD_OWNER);
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        vm.stopPrank();
    }
    
    function testExtendExpiryNonEmancipatedName() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create non-emancipated child (no PARENT_CANNOT_CONTROL)
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600)
        );
        
        // Both parent and child should be able to extend expiry
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, uint64(parentExpiry - 1800));
        
        vm.stopPrank();
        
        vm.startPrank(CHILD_OWNER);
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        vm.stopPrank();
    }
    
    function testExtendExpiryByParentOwnerWithCanExtendExpiryBurned() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with CAN_EXTEND_EXPIRY burned
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600)
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Initial fuses incorrect");
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry incorrect");
        
        // Parent owner should be able to extend expiry
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new state
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Fuses should remain unchanged");
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByParentOwnerWithSameChildOwnerAndCanExtendExpiryBurned() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with same owner as parent and CAN_EXTEND_EXPIRY burned
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            OWNER, // Same as parent owner
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600)
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Initial fuses incorrect");
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry incorrect");
        
        // Parent/child owner should be able to extend expiry
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new state
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Fuses should remain unchanged");
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByApprovedOperatorOfParentOwnerWithoutCanExtendExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain without CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(parentExpiry - 3600)
        );
        
        // Approve operator for parent owner
        nameWrapper.setApprovalForAll(OPERATOR, true);
        
        vm.stopPrank();
        
        // Operator should be able to extend expiry (parent's operator can always extend)
        vm.startPrank(OPERATOR);
        
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByApprovedOperatorOfParentOwnerWithCanExtendExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600)
        );
        
        // Approve operator for parent owner
        nameWrapper.setApprovalForAll(OPERATOR, true);
        
        vm.stopPrank();
        
        // Operator should be able to extend expiry
        vm.startPrank(OPERATOR);
        
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryByChildOwnerWithoutCanExtendExpiryBurned() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain without CAN_EXTEND_EXPIRY (only PCC and CANNOT_UNWRAP)
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(parentExpiry - 3600)
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP, "Initial fuses incorrect");
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry incorrect");
        
        vm.stopPrank();
        
        // Child owner should NOT be able to extend expiry without CAN_EXTEND_EXPIRY
        vm.startPrank(CHILD_OWNER);
        
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", CHILD_NODE));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryByApprovedOperatorOfChildOwnerWithoutCanExtendExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain without CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(parentExpiry - 3600)
        );
        
        vm.stopPrank();
        
        // Child owner approves operator
        vm.startPrank(CHILD_OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();
        
        // Operator should NOT be able to extend expiry without CAN_EXTEND_EXPIRY
        vm.startPrank(OPERATOR);
        
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", CHILD_NODE));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByApprovedOperatorOfChildOwnerWithCanExtendExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600)
        );
        
        vm.stopPrank();
        
        // Child owner approves operator
        vm.startPrank(CHILD_OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();
        
        // Operator should be able to extend expiry with CAN_EXTEND_EXPIRY
        vm.startPrank(OPERATOR);
        
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new expiry
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByParentOwnerOfNonEmancipatedName() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create non-emancipated child subdomain (fuses = 0, no PARENT_CANNOT_CONTROL)
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            0, // No fuses - non-emancipated
            uint64(parentExpiry - 3600)
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, 0, "Initial fuses should be 0");
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry should be parentExpiry - 3600");
        
        // Parent owner should be able to extend expiry
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new state
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newFuses, 0, "Fuses should remain unchanged");
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testExtendExpiryByChildOwnerOfNonEmancipatedName() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create non-emancipated child subdomain with CAN_EXTEND_EXPIRY (no PARENT_CANNOT_CONTROL)
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            CAN_EXTEND_EXPIRY, // Only CAN_EXTEND_EXPIRY - non-emancipated
            uint64(parentExpiry - 3600)
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, CAN_EXTEND_EXPIRY, "Initial fuses should be CAN_EXTEND_EXPIRY");
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry should be parentExpiry - 3600");
        
        vm.stopPrank();
        
        // Child owner should be able to extend expiry
        vm.startPrank(CHILD_OWNER);
        
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check new state
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newFuses, CAN_EXTEND_EXPIRY, "Fuses should remain unchanged");
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryIfEmancipatedChildNameHasExpiredChildOwner() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create emancipated child subdomain (with PARENT_CANNOT_CONTROL) that expires soon
        uint64 childExpiry = uint64(parentExpiry - DAY + 3600); // Child expires 1 day before parent + 1 hour
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY,
            childExpiry
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CAN_EXTEND_EXPIRY, "Initial fuses should include PCC and CAN_EXTEND_EXPIRY");
        assertEq(initialExpiry, childExpiry, "Initial expiry should match child expiry");
        
        // Fast forward until the child name expires (past childExpiry)
        vm.warp(childExpiry + 1);
        
        vm.stopPrank();
        
        // Child owner should NOT be able to extend expiry after expiration
        vm.startPrank(CHILD_OWNER);
        
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryIfEmancipatedChildNameHasExpiredParentOwner() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create emancipated child subdomain (with PARENT_CANNOT_CONTROL) that expires soon
        uint64 childExpiry = uint64(parentExpiry - DAY + 3600); // Child expires 1 day before parent + 1 hour
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL,
            childExpiry
        );
        
        // Check initial state
        address owner;
        uint32 initialFuses;
        uint64 initialExpiry;
        (owner, initialFuses, initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, CHILD_OWNER, "Owner should be CHILD_OWNER");
        assertEq(initialFuses, PARENT_CANNOT_CONTROL, "Initial fuses should include PCC");
        assertEq(initialExpiry, childExpiry, "Initial expiry should match child expiry");
        
        // Fast forward until the child name expires (past childExpiry)
        vm.warp(childExpiry + 1);
        
        // Parent owner should NOT be able to extend expiry after expiration
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testExpiryIsNotNormalizedToNewValueIfBetweenOldExpiryAndParentExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with expiry 1 hour before parent expiry
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 3600) // 1 hour before parent expiry
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Initial fuses should include PCC, CANNOT_UNWRAP, and CAN_EXTEND_EXPIRY");
        assertEq(initialExpiry, parentExpiry - 3600, "Initial expiry should be parentExpiry - 3600");
        
        vm.stopPrank();
        
        // Child owner extends expiry to a value between current expiry and parent expiry
        vm.startPrank(CHILD_OWNER);
        
        uint64 targetExpiry = uint64(parentExpiry - 1800); // 30 minutes before parent expiry (between current and parent)
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, targetExpiry);
        
        // Check that expiry was set to the exact target value (not normalized)
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Fuses should remain unchanged");
        assertEq(newExpiry, targetExpiry, "Expiry should be set to exact target value (parentExpiry - 1800)");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryByParentOwnerIfEth2LDExpiredButGracePeriodNotEnded() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain with short duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 * DAY); // Register for only 1 day
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with expiry 1 hour before grace period ends
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(parentExpiry + baseRegistrar.GRACE_PERIOD() - 3600) // 1 hour before grace period ends
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP, "Initial fuses should include PCC and CANNOT_UNWRAP");
        assertEq(initialExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD() - 3600, "Initial expiry should be parentExpiry + grace period - 3600");
        
        // Fast forward until the 2LD expires (past parentExpiry but within grace period)
        vm.warp(parentExpiry + 1 * DAY + 1);
        
        // Parent owner should NOT be able to extend expiry after 2LD expires
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", CHILD_NODE, OWNER));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testAllowsChildOwnerToSetExpiryIfParentEth2LDExpiredButGracePeriodNotEnded() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain with short duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 * DAY); // Register for only 1 day
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create child subdomain with expiry 1 hour before grace period ends and CAN_EXTEND_EXPIRY
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY,
            uint64(parentExpiry + baseRegistrar.GRACE_PERIOD() - 3600) // 1 hour before grace period ends
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Initial fuses should include PCC, CANNOT_UNWRAP, and CAN_EXTEND_EXPIRY");
        assertEq(initialExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD() - 3600, "Initial expiry should be parentExpiry + grace period - 3600");
        
        // Fast forward until the 2LD expires (past parentExpiry but within grace period)
        vm.warp(parentExpiry + 1 * DAY + 1);
        
        vm.stopPrank();
        
        // Child owner SHOULD be able to extend expiry even after parent 2LD expires (within grace period)
        vm.startPrank(CHILD_OWNER);
        
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check that expiry was extended correctly
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newFuses, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CAN_EXTEND_EXPIRY, "Fuses should remain unchanged");
        // When parent is expired but in grace period, child can still extend up to parent expiry + grace period
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryByChildOwnerIfNonEmancipatedChildNameReachedExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create non-emancipated child subdomain (only CAN_EXTEND_EXPIRY, no PARENT_CANNOT_CONTROL) that expires soon
        uint64 childExpiry = uint64(parentExpiry - DAY + 3600); // Child expires 1 day before parent + 1 hour
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            CAN_EXTEND_EXPIRY, // Only CAN_EXTEND_EXPIRY - non-emancipated
            childExpiry
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, CAN_EXTEND_EXPIRY, "Initial fuses should be CAN_EXTEND_EXPIRY");
        assertEq(initialExpiry, childExpiry, "Initial expiry should match child expiry");
        
        // Fast forward until the child name expires (past childExpiry)
        vm.warp(childExpiry + 1);
        
        vm.stopPrank();
        
        // Child owner should NOT be able to extend expiry after expiration (non-emancipated)
        vm.startPrank(CHILD_OWNER);
        
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", CHILD_NODE));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testAllowsParentOwnerToSetExpiryIfNonEmancipatedChildNameReachedExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create non-emancipated child subdomain (fuses = 0, no PARENT_CANNOT_CONTROL) that expires soon
        uint64 childExpiry = uint64(parentExpiry - DAY + 3600); // Child expires 1 day before parent + 1 hour
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            0, // No fuses - non-emancipated
            childExpiry
        );
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, 0, "Initial fuses should be 0");
        assertEq(initialExpiry, childExpiry, "Initial expiry should match child expiry");
        
        // Fast forward until the child name expires (past childExpiry)
        vm.warp(childExpiry + 1);
        
        // Parent owner SHOULD be able to extend expiry even after child expiration (non-emancipated)
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check that expiry was extended correctly
        (address owner, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, CHILD_OWNER, "Owner should remain CHILD_OWNER");
        assertEq(newFuses, 0, "Fuses should remain unchanged");
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryOfUnregisteredNameNotRegisteredEver() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Check that unregistered subdomain has zero data
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, address(0), "Owner should be zero address");
        assertEq(fuses, 0, "Fuses should be 0");
        assertEq(expiry, 0, "Expiry should be 0");
        
        // Try to extend expiry of never-registered subdomain - should fail
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryOfUnregisteredNameExpiredWithPCCBurnt() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain with longer duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 10 * DAY);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create subdomain with PARENT_CANNOT_CONTROL that expires before parent
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            PARENT_CANNOT_CONTROL,
            uint64(parentExpiry - 5 * DAY) // Expires 5 days before parent
        );
        
        // Advance time so the subdomain expires, but not the parent
        vm.warp(block.timestamp + 5 * DAY + 1);
        
        // Try to extend expiry of expired subdomain - should fail
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testAllowExtendExpiryOnWrappedNames() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain with longer duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 10 * DAY);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create subdomain with CAN_EXTEND_EXPIRY that expires before parent
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            CAN_EXTEND_EXPIRY,
            uint64(parentExpiry - 5 * DAY) // Expires 5 days before parent
        );
        
        // Advance time so the subdomain expires, but not the parent
        vm.warp(block.timestamp + 5 * DAY + 1);
        
        // Should be able to extend expiry of wrapped name even after expiry
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        // Check that expiry was extended
        (address owner, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, OWNER, "Owner should remain OWNER");
        assertEq(newFuses, 0, "Fuses should be reset to 0 after expiry and extension");
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "New expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testCannotExtendExpiryOfUnwrappedNames() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain initially with no fuses
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(0), address(0));
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Create subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            0, // No fuses
            uint64(parentExpiry - 3600)
        );
        
        // Unwrap the parent domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);
        
        // Manually set subdomain owner in ENS registry (simulating external change)
        ens.setSubnodeOwner(TEST_NODE, CHILD_LABEL_HASH, OWNER);
        
        // Rewrap the parent with CANNOT_UNWRAP
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Check that subdomain data still exists in NameWrapper but ENS registry owner is different
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, OWNER, "NameWrapper should still show OWNER");
        assertEq(fuses, 0, "Fuses should be 0");
        assertEq(expiry, parentExpiry - 3600, "Expiry should be preserved");
        
        // Verify ENS registry owner is OWNER (not NameWrapper)
        assertEq(ens.owner(CHILD_NODE), OWNER, "ENS registry should show OWNER as owner");
        
        // Try to extend expiry of unwrapped name - should fail
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.extendExpiry(TEST_NODE, CHILD_LABEL_HASH, MAX_EXPIRY);
        
        vm.stopPrank();
    }
}

