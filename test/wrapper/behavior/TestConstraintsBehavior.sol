// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";
import {INameWrapper, CANNOT_UNWRAP, CANNOT_SET_RESOLVER, PARENT_CANNOT_CONTROL, CAN_DO_EVERYTHING, IS_DOT_ETH, CANNOT_TRANSFER, CANNOT_BURN_FUSES, CANNOT_APPROVE} from "../../../contracts/wrapper/INameWrapper.sol";

/**
 * @title ConstraintsBehavior
 * @dev Constraint behavior tests for NameWrapper
 * 
 * States (binary representation):
 * Expiry > block.timestamp | CU burned | PCC burned | Parent burned parent's CU
 * CU = CANNOT_UNWRAP
 * PCC = PARENT_CANNOT_CONTROL
 * PCU = Parent burned parent's CU
 * 
 * 0000 = Default Wrapped (DW) - expired, nothing burned
 * 1000 = Not Expired (NE) - unexpired, nothing burned
 * 0100 = CU burned - expired, CU burned
 * 0010 = PCC burned - expired, PCC burned  
 * 0001 = Parent burned parent's CU (PCU) - expired, parent CU burned
 * ... and all combinations up to 1111
 */
contract ConstraintsBehavior is Test {
    
    // Contracts
    NameWrapper public nameWrapper;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    ReverseRegistrar public reverseRegistrar;
    IMetadataService public metadataService;
    
    // Test accounts
    address constant OWNER = address(0x1);        // accounts[0]
    address constant CHILD_OWNER = address(0x2);  // accounts[1]
    address constant OTHER = address(0x3);        // accounts[2]
    
    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE = keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    
    // Test domain management - ensure unique domains per test
    uint256 private testCounter = 0;
    mapping(string => bool) private usedTestNames;
    
    function _getUniqueParentLabel() internal returns (string memory) {
        testCounter++;
        string memory parentLabel = string(abi.encodePacked("test", vm.toString(testCounter)));
        
        // Ensure uniqueness
        while (usedTestNames[parentLabel]) {
            testCounter++;
            parentLabel = string(abi.encodePacked("test", vm.toString(testCounter)));
        }
        usedTestNames[parentLabel] = true;
        
        return parentLabel;
    }
    
    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant GRACE_PERIOD = 90 * uint64(DAY);
    uint64 constant MAX_EXPIRY = type(uint64).max;
    
    // Events
    event ExpiryExtended(bytes32 indexed node, uint64 expiry);
    event FusesSet(bytes32 indexed node, uint32 fuses);
    
    // Struct for test state
    struct TestState {
        address owner;
        address childOwner;
        address other;
        uint64 parentExpiry;
        uint64 childExpiry;
        uint32 parentFuses;
        uint32 childFuses;
        // Dynamic domain info
        string parentLabel;
        bytes32 parentLabelHash;
        uint256 parentLabelId;
        bytes32 parentNode;
        uint256 parentNodeId;
        string childLabel;
        bytes32 childLabelHash;
        bytes32 childNode;
        uint256 childNodeId;
    }
    
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
    
    // === State Setup Functions ===
    
    function _setupState(uint32 parentFuses, uint32 childFuses, uint64 childExpiry) internal returns (TestState memory) {
        vm.startPrank(OWNER);
        
        // Get unique domain data for this test
        string memory parentLabel = _getUniqueParentLabel();
        bytes32 parentLabelHash = keccak256(bytes(parentLabel));
        uint256 parentLabelId = uint256(parentLabelHash);
        bytes32 parentNode = keccak256(abi.encodePacked(ETH_NODE, parentLabelHash));
        
        string memory childLabel = "sub";
        bytes32 childLabelHash = keccak256(bytes(childLabel));
        bytes32 childNode = keccak256(abi.encodePacked(parentNode, childLabelHash));
        
        // Move past grace period
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Register and wrap parent domain
        baseRegistrar.register(parentLabelId, OWNER, DAY);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(parentLabel, OWNER, uint16(parentFuses), address(0));
        
        uint64 parentExpiry = uint64(baseRegistrar.nameExpires(parentLabelId));
        
        // Create child subdomain
        nameWrapper.setSubnodeOwner(
            parentNode,
            childLabel,
            CHILD_OWNER,
            childFuses,
            childExpiry
        );
        
        vm.stopPrank();
        
        return TestState({
            owner: OWNER,
            childOwner: CHILD_OWNER,
            other: OTHER,
            parentExpiry: parentExpiry,
            childExpiry: childExpiry,
            parentFuses: parentFuses,
            childFuses: childFuses,
            parentLabel: parentLabel,
            parentLabelHash: parentLabelHash,
            parentLabelId: parentLabelId,
            parentNode: parentNode,
            parentNodeId: uint256(parentNode),
            childLabel: childLabel,
            childLabelHash: childLabelHash,
            childNode: childNode,
            childNodeId: uint256(childNode)
        });
    }
    
    function _setupStateUnexpired(uint32 parentFuses, uint32 childFuses) internal returns (TestState memory) {
        vm.startPrank(OWNER);
        
        // Get unique domain data for this test
        string memory parentLabel = _getUniqueParentLabel();
        bytes32 parentLabelHash = keccak256(bytes(parentLabel));
        uint256 parentLabelId = uint256(parentLabelHash);
        bytes32 parentNode = keccak256(abi.encodePacked(ETH_NODE, parentLabelHash));
        
        string memory childLabel = "sub";
        bytes32 childLabelHash = keccak256(bytes(childLabel));
        bytes32 childNode = keccak256(abi.encodePacked(parentNode, childLabelHash));
        
        // Move past grace period
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Register parent domain for 2 days
        baseRegistrar.register(parentLabelId, OWNER, DAY * 2);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(parentLabel, OWNER, uint16(parentFuses), address(0));
        
        uint64 parentExpiry = uint64(baseRegistrar.nameExpires(parentLabelId));
        uint64 childExpiry = parentExpiry - uint64(DAY); // Expires a day before parent
        
        // Create child subdomain
        nameWrapper.setSubnodeOwner(
            parentNode,
            childLabel,
            CHILD_OWNER,
            childFuses,
            childExpiry
        );
        
        vm.stopPrank();
        
        return TestState({
            owner: OWNER,
            childOwner: CHILD_OWNER,
            other: OTHER,
            parentExpiry: parentExpiry,
            childExpiry: childExpiry,
            parentFuses: parentFuses,
            childFuses: childFuses,
            parentLabel: parentLabel,
            parentLabelHash: parentLabelHash,
            parentLabelId: parentLabelId,
            parentNode: parentNode,
            parentNodeId: uint256(parentNode),
            childLabel: childLabel,
            childLabelHash: childLabelHash,
            childNode: childNode,
            childNodeId: uint256(childNode)
        });
    }
    
    // State setup functions
    function setupState0000DW() internal returns (TestState memory) {
        return _setupState(CAN_DO_EVERYTHING, uint16(CAN_DO_EVERYTHING), 0);
    }
    
    function setupState0001PCU() internal returns (TestState memory) {
        return _setupState(CANNOT_UNWRAP, uint16(CAN_DO_EVERYTHING), 0);
    }
    
    function setupState1000NE() internal returns (TestState memory) {
        return _setupStateUnexpired(CAN_DO_EVERYTHING, CAN_DO_EVERYTHING);
    }
    
    function setupState1001NE_PCU() internal returns (TestState memory) {
        return _setupStateUnexpired(CANNOT_UNWRAP, CAN_DO_EVERYTHING);
    }
    
    function setupState1011NE_PCC_PCU() internal returns (TestState memory) {
        return _setupStateUnexpired(CANNOT_UNWRAP, PARENT_CANNOT_CONTROL);
    }
    
    function setupState1111NE_CU_PCC_PCU() internal returns (TestState memory) {
        return _setupStateUnexpired(CANNOT_UNWRAP, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP);
    }
    
    // === Reusable Test Functions ===
    
    function _parentCanExtend(TestState memory state, bool isNotExpired) internal {
        if (isNotExpired) {
            // Child should have an expiry < parent
            (, , uint64 childExpiry) = nameWrapper.getData(state.childNodeId);
            uint64 parentExpiry = uint64(baseRegistrar.nameExpires(state.parentLabelId));
            assertLt(childExpiry, parentExpiry, "Child expiry should be less than parent");
            assertGt(childExpiry, block.timestamp, "Child should not be expired");
        } else {
            // Child should have a 0 expiry before extending
            (, , uint64 expiryBefore) = nameWrapper.getData(state.childNodeId);
            assertEq(expiryBefore, 0, "Child should have 0 expiry before extending");
        }
        
        // Parent can extend expiry with setChildFuses()
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint16(CAN_DO_EVERYTHING), MAX_EXPIRY);
        (, , uint64 expiry1) = nameWrapper.getData(state.childNodeId);
        assertEq(expiry1, state.parentExpiry + GRACE_PERIOD, "Expiry should be parent + grace period");
        
        // Reset for next test
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, state.childFuses, 0);
        
        // Parent can extend expiry with setSubnodeOwner()
        vm.prank(state.owner);
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, uint16(CAN_DO_EVERYTHING), MAX_EXPIRY);
        (, , uint64 expiry2) = nameWrapper.getData(state.childNodeId);
        assertEq(expiry2, state.parentExpiry + GRACE_PERIOD, "Expiry should be parent + grace period");
        
        // Reset for next test
        vm.prank(state.owner);
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, state.childFuses, 0);
        
        // Parent can extend expiry with setSubnodeRecord()
        vm.prank(state.owner);
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, uint16(CAN_DO_EVERYTHING), MAX_EXPIRY);
        (, , uint64 expiry3) = nameWrapper.getData(state.childNodeId);
        assertEq(expiry3, state.parentExpiry + GRACE_PERIOD, "Expiry should be parent + grace period");
    }
    
    function _parentCannotBurnFusesOrPCC(TestState memory state) internal {
        // Parent cannot burn fuses with setChildFuses()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL), 0);
        
        // Parent cannot burn fuses with setSubnodeOwner()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL), 0);
        
        // Parent cannot burn fuses with setSubnodeRecord()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL), 0);
    }
    
    function _parentCanExtendWithSetChildFusesOnly(TestState memory state, bool isNotExpired) internal {
        if (isNotExpired) {
            // Child should have an expiry < parent
            (, , uint64 childExpiry) = nameWrapper.getData(state.childNodeId);
            uint64 parentExpiry = uint64(baseRegistrar.nameExpires(state.parentLabelId));
            assertLt(childExpiry, parentExpiry, "Child expiry should be less than parent");
            assertGt(childExpiry, block.timestamp, "Child should not be expired");
        } else {
            // Child should have a 0 expiry before extending
            (, , uint64 expiryBefore) = nameWrapper.getData(state.childNodeId);
            assertEq(expiryBefore, 0, "Child should have 0 expiry before extending");
        }
        
        // Parent can extend expiry with setChildFuses() when PARENT_CANNOT_CONTROL is burned
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint16(CAN_DO_EVERYTHING), MAX_EXPIRY);
        (, , uint64 expiry) = nameWrapper.getData(state.childNodeId);
        assertEq(expiry, state.parentExpiry + GRACE_PERIOD, "Expiry should be parent + grace period");
    }
    
    function _parentCanReplaceOwner(TestState memory state) internal {
        // Check current owner (might be different from expected if expired)
        address currentOwner = nameWrapper.ownerOf(state.childNodeId);
        
        // Parent can replace owner with setSubnodeOwner()
        vm.prank(state.owner);
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.owner, uint16(CAN_DO_EVERYTHING), 0);
        
        assertEq(nameWrapper.ownerOf(state.childNodeId), state.owner, "Child should now be owned by parent");
        
        // Reset
        vm.prank(state.owner);
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, state.childFuses, state.childExpiry);
        
        // Parent can replace owner with setSubnodeRecord()
        vm.prank(state.owner);
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.owner, address(0), 0, uint16(CAN_DO_EVERYTHING), 0);
        
        assertEq(nameWrapper.ownerOf(state.childNodeId), state.owner, "Child should now be owned by parent");
    }
    
    function _parentCanUnwrapChild(TestState memory state) internal {
        // Parent can unwrap owner with setSubnodeRecord() and then unwrap
        assertEq(ens.owner(state.childNode), address(nameWrapper), "ENS should be owned by NameWrapper");
        
        vm.prank(state.owner);
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.owner, address(0), 0, uint16(CAN_DO_EVERYTHING), 0);
        
        vm.prank(state.owner);
        nameWrapper.unwrap(state.parentNode, state.childLabelHash, state.owner);
        
        assertEq(nameWrapper.ownerOf(state.childNodeId), address(0), "Child should no longer be wrapped");
        assertEq(ens.owner(state.childNode), state.owner, "ENS should be owned by parent");
    }
    
    function _parentCannotBurnParentControlledFuses(TestState memory state) internal {
        // Parent cannot burn parent-controlled fuses
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(1 << 18), 0);
    }
    
    function _ownerIsOwnerWhenExpired(TestState memory state) internal {
        // Owner is still owner when expired
        (, , uint64 expiry) = nameWrapper.getData(state.childNodeId);
        assertLt(expiry, block.timestamp, "Child should be expired");
        assertEq(nameWrapper.ownerOf(state.childNodeId), state.childOwner, "Child should still be owned by child owner");
    }
    
    function _ownerCannotBurnFuses(TestState memory state) internal {
        // Owner cannot burn CU because PCC is not burned
        vm.prank(state.childOwner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_UNWRAP));
        
        // Owner cannot burn other fuses because CU and PCC are not burned
        vm.prank(state.childOwner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_SET_RESOLVER));
    }
    
    function _ownerCanUnwrap(TestState memory state) internal {
        vm.prank(state.childOwner);
        nameWrapper.unwrap(state.parentNode, state.childLabelHash, state.childOwner);
        assertEq(nameWrapper.ownerOf(state.childNodeId), address(0), "Child should no longer be wrapped");
    }
    
    function _parentCanBurnParentControlledFusesWithExpiry(TestState memory state) internal {
        // Check if parent has CANNOT_UNWRAP burned
        (, uint32 parentFuses, ) = nameWrapper.getData(state.parentNodeId);
        bool parentHasCUBurned = parentFuses & CANNOT_UNWRAP != 0;
        
        if (parentHasCUBurned) {
            // State 0001PCU: Parent has CANNOT_UNWRAP burned, operations succeed but fuses normalize to 0 for expired children
            vm.prank(state.owner);
            nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(1 << 18), 0);
            
            // Verify fuses normalize to 0 for expired child
            (, uint32 fuses, ) = nameWrapper.getData(state.childNodeId);
            assertEq(fuses, 0, "Fuses should be reset to 0 for expired child");
            
            // Parent can burn parent-controlled fuses if expiry is extended
            vm.prank(state.owner);
            nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(1 << 18), MAX_EXPIRY);
            
            (, uint32 fusesAfter, ) = nameWrapper.getData(state.childNodeId);
            assertEq(fusesAfter, uint32(1 << 18), "Parent-controlled fuse should be set with extended expiry");
        } else {
            // State 0000DW: Parent doesn't have CANNOT_UNWRAP burned, so operations fail
            // Attempt to burn parent-controlled fuses should fail with OperationProhibited
            vm.prank(state.owner);
            vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
            nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(1 << 18), 0);
            
            // Verify fuses remain 0 since operation failed
            (, uint32 fuses, ) = nameWrapper.getData(state.childNodeId);
            assertEq(fuses, 0, "Fuses should remain 0 since operation was prohibited");
            
            // Even with extended expiry, operation should fail because parent doesn't have CANNOT_UNWRAP burned
            vm.prank(state.owner);
            vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
            nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(1 << 18), MAX_EXPIRY);
            
            // Final check: fuses should remain 0 since operation failed
            (, uint32 fusesAfter, ) = nameWrapper.getData(state.childNodeId);
            assertEq(fusesAfter, 0, "Fuses should remain 0 as operation was prohibited");
        }
    }
    
    function _parentCanSetFusesOnExpiredChild(TestState memory state) internal {
        // Test: "Parent can set fuses on expired child, result normalizes to 0" for state 0001PCU
        
        // Check initial state
        (, uint32 fusesBefore, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesBefore, 0, "Child should start with no fuses");
        
        // Parent can set fuses on expired child - operation succeeds but result normalizes to 0
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER), 0);
        
        // Verify fuses normalize to 0 because child is expired
        (, uint32 fusesAfter, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesAfter, 0, "Fuses should normalize to 0 for expired child");
    }
    
    function _parentCanBurnFusesWithSetChildFuses(TestState memory state) internal {
        // Parent can burn fuses with setChildFuses()
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER), 0);
        
        (, uint32 fuses, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fuses, CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER, "Fuses should be set with setChildFuses");
    }
    
    function _parentCanBurnFusesWithSetSubnodeOwner(TestState memory state) internal {
        // Parent can burn fuses with setSubnodeOwner()
        vm.prank(state.owner);
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER), 0);
        
        (, uint32 fuses, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fuses, CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER, "Fuses should be set with setSubnodeOwner");
    }
    
    function _parentCanBurnFusesWithSetSubnodeRecord(TestState memory state) internal {
        // Parent can burn fuses with setSubnodeRecord()
        vm.prank(state.owner);
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, uint32(CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER), 0);
        
        (, uint32 fuses, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fuses, CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER, "Fuses should be set with setSubnodeRecord");
    }
    
    function _parentCanBurnParentControlledFuses(TestState memory state) internal {
        
        // Parent can burn parent-controlled fuses
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(1 << 18), 0);
        
        (, uint32 fuses, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fuses, 1 << 18, "Parent-controlled fuse should be set");
    }
    
    function _ownerResetsToZeroWhenExpired(TestState memory state, uint32 expectedFuses) internal {
        // Check state before expiry
        (, uint32 fusesBefore, uint64 expiryBefore) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesBefore, expectedFuses, "Fuses should match expected before expiry");
        assertGt(expiryBefore, block.timestamp, "Child should not be expired yet");
        
        // Move forward in time to expire the child
        vm.warp(state.childExpiry + 1);
        
        // Check state after expiry
        (, uint32 fusesAfter, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesAfter, 0, "Fuses should reset to 0 after expiry");
    }
    
    // === State Tests structure ===
    
    function testState0000DW_ParentCanExtend() public {
        TestState memory state = setupState0000DW();
        _parentCanExtend(state, false);
    }
    
    function testState0000DW_ParentCanReplaceOwner() public {
        TestState memory state = setupState0000DW();
        _parentCanReplaceOwner(state);
    }
    
    function testState0000DW_ParentCanUnwrapChild() public {
        TestState memory state = setupState0000DW();
        _parentCanUnwrapChild(state);
    }
    
    function testState0000DW_ParentCanBurnParentControlledFusesWithExpiry() public {
        TestState memory state = setupState0000DW();
        
        _parentCanBurnParentControlledFusesWithExpiry(state);
    }
    
    function testState0000DW_ParentCannotBurnFusesOrPCC() public {
        TestState memory state = setupState0000DW();
        _parentCannotBurnFusesOrPCC(state);
    }
    
    function testState0000DW_OwnerBehaviors() public {
        TestState memory state = setupState0000DW();
        _ownerIsOwnerWhenExpired(state);
        _ownerCannotBurnFuses(state);
        _ownerCanUnwrap(state);
    }
    
    function testState0001PCU() public {
        TestState memory state = setupState0001PCU();
        
        // Test: 0001 - PCU - Expired, Parent's CU burned.
        _parentCanExtend(state, false);
        _parentCanReplaceOwner(state);
        _parentCanUnwrapChild(state);
        
        // Re-setup state after unwrap
        state = setupState0001PCU();
        _parentCanBurnParentControlledFusesWithExpiry(state);
        
        state = setupState0001PCU();
        _parentCanSetFusesOnExpiredChild(state);
        
        state = setupState0001PCU();
        _ownerIsOwnerWhenExpired(state);
        _ownerCannotBurnFuses(state);
        _ownerCanUnwrap(state);
    }
    
    function testState1000NE() public {
        TestState memory state = setupState1000NE();
        
        // Test: 1000 - NE - Not expired, nothing burnt.
        _parentCanExtend(state, true);
        _parentCanReplaceOwner(state);
        _parentCanUnwrapChild(state);
        
        // Re-setup state after unwrap
        state = setupState1000NE();
        _parentCannotBurnParentControlledFuses(state);
        
        state = setupState1000NE();
        _parentCannotBurnFusesOrPCC(state);
        
        state = setupState1000NE();
        _ownerCannotBurnFuses(state);
        _ownerCanUnwrap(state);
        
        state = setupState1000NE();
        _ownerResetsToZeroWhenExpired(state, CAN_DO_EVERYTHING);
    }
    
    function testState1001NE_PCU() public {
        TestState memory state = setupState1001NE_PCU();
        
        
        // Test: 1001 - NE_PCU - Not expired, Parent's CU burned.
        _parentCanExtend(state, true);
        _parentCanReplaceOwner(state);
        _parentCanUnwrapChild(state);
        
        // Re-setup state after unwrap
        state = setupState1001NE_PCU();
        _parentCanBurnParentControlledFuses(state);
        
        state = setupState1001NE_PCU();
        _parentCanBurnFusesWithSetChildFuses(state);
        
        state = setupState1001NE_PCU();
        _parentCanBurnFusesWithSetSubnodeOwner(state);
        
        state = setupState1001NE_PCU();
        _parentCanBurnFusesWithSetSubnodeRecord(state);
        
        state = setupState1001NE_PCU();
        _ownerCannotBurnFuses(state);
        _ownerCanUnwrap(state);
        
        state = setupState1001NE_PCU();
        _ownerResetsToZeroWhenExpired(state, CAN_DO_EVERYTHING);
    }
    
    function testState1011NE_PCC_PCU() public {
        TestState memory state = setupState1011NE_PCC_PCU();
        
        // Test: 1011 - NE_PCC_PCU - Not expired, PCC and Parent's CU burned.
        _parentCanExtendWithSetChildFusesOnly(state, true);
        
        // Re-setup state after _parentCanExtend modifies it
        state = setupState1011NE_PCC_PCU();
        _parentCannotBurnFusesOrPCC(state);
        
        // Parent cannot unburn fuses with setChildFuses()
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, 0, 0);
        (, uint32 fuses1, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fuses1, PARENT_CANNOT_CONTROL, "PCC should remain");
        
        // Parent cannot unburn fuses with setSubnodeOwner()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, 0, 0);
        
        // Parent cannot unburn fuses with setSubnodeRecord()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, 0, 0);
        
        // Parent cannot replace owner
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.owner, uint16(CAN_DO_EVERYTHING), 0);
        
        // Parent cannot unwrap child
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.owner, address(0), 0, uint16(CAN_DO_EVERYTHING), 0);
        
        _parentCannotBurnParentControlledFuses(state);
        
        // Owner can burn CU
        vm.prank(state.childOwner);
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_UNWRAP));
        (, uint32 fusesAfter, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesAfter, CANNOT_UNWRAP | PARENT_CANNOT_CONTROL, "CU should be burned");
        
        // Reset
        state = setupState1011NE_PCC_PCU();
        
        // Owner cannot burn fuses because CU is unburned
        vm.prank(state.childOwner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_SET_RESOLVER));
        
        _ownerCanUnwrap(state);
        
        state = setupState1011NE_PCC_PCU();
        _ownerResetsToZeroWhenExpired(state, PARENT_CANNOT_CONTROL);
    }
    
    function testState1111NE_CU_PCC_PCU() public {
        TestState memory state = setupState1111NE_CU_PCC_PCU();
        
        // Test: 1111 - NE_CU_PCC_PCU - Not expired, CU, PCC and Parent's CU burned.
        _parentCanExtendWithSetChildFusesOnly(state, true);
        
        // Re-setup state after _parentCanExtend modifies it
        state = setupState1111NE_CU_PCC_PCU();
        
        // Parent cannot unburn fuses with setChildFuses()
        vm.prank(state.owner);
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, 0, 0);
        (, uint32 fuses1, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fuses1, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP, "PCC and CU should remain");
        
        // Parent cannot unburn fuses with setSubnodeOwner()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, 0, 0);
        
        // Parent cannot unburn fuses with setSubnodeRecord()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, 0, 0);
        
        // Parent cannot replace owner
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.owner, uint16(CAN_DO_EVERYTHING), 0);
        
        // Parent cannot unwrap child
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.owner, address(0), 0, uint16(CAN_DO_EVERYTHING), 0);
        
        _parentCannotBurnParentControlledFuses(state);
        
        // Owner can burn fuses
        vm.prank(state.childOwner);
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_SET_RESOLVER));
        (, uint32 fusesAfter, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesAfter, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_SET_RESOLVER, "Additional fuse should be burned");
        
        // Reset
        state = setupState1111NE_CU_PCC_PCU();
        
        // Owner cannot unburn fuses
        vm.prank(state.childOwner);
        nameWrapper.setFuses(state.childNode, uint16(0));
        (, uint32 fusesStill, ) = nameWrapper.getData(state.childNodeId);
        assertEq(fusesStill, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP, "Fuses should not be unburned");
        
        // Owner cannot unwrap
        vm.prank(state.childOwner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.unwrap(state.parentNode, state.childLabelHash, state.childOwner);
        
        _ownerResetsToZeroWhenExpired(state, PARENT_CANNOT_CONTROL | CANNOT_UNWRAP);
    }
    
    // === Impossible State Tests ===
    
    function testState1100NE_CU_ImpossibleState() public {
        TestState memory state = setupState1000NE();
        
        // 1000 => 1100 - NE => NE_CU - Parent cannot burn CU with setChildFuses()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint16(CANNOT_UNWRAP), 0);
        
        // 1000 => 1100 - NE => NE_CU - Parent cannot burn CU with setSubnodeOwner()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, uint16(CANNOT_UNWRAP), 0);
        
        // 1000 => 1100 - NE => NE_CU - Parent cannot burn CU with setSubnodeRecord()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, uint16(CANNOT_UNWRAP), 0);
        
        // 1000 => 1100 - NE => NE_CU - Owner cannot burn CU with setFuses()
        vm.prank(state.childOwner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_UNWRAP));
    }
    
    function testState1101NE_CU_PCU_ImpossibleState() public {
        TestState memory state = setupState1001NE_PCU();
        
        // 1001 => 1101 - NE_PCU => NE_CU_PCU - Parent cannot burn CU with setChildFuses()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint16(CANNOT_UNWRAP), 0);
        
        // 1001 => 1101 - NE_PCU => NE_CU_PCU - Parent cannot burn CU with setSubnodeOwner()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, uint16(CANNOT_UNWRAP), 0);
        
        // 1001 => 1101 - NE_PCU => NE_CU_PCU - Parent cannot burn CU with setSubnodeRecord()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, uint16(CANNOT_UNWRAP), 0);
        
        // 1001 => 1101 - NE_PCU => NE_CU_PCU - Owner cannot burn CU with setFuses()
        vm.prank(state.childOwner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setFuses(state.childNode, uint16(CANNOT_UNWRAP));
    }
    
    function testState1000to1010StateTransition() public {
        TestState memory state = setupState1000NE();
        
        
        // 1000 => 1010 - Parent cannot burn PCC with setChildFuses()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setChildFuses(state.parentNode, state.childLabelHash, uint32(PARENT_CANNOT_CONTROL), 0);
        
        // 1000 => 1010 - Parent cannot burn PCC with setSubnodeOwner()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeOwner(state.parentNode, state.childLabel, state.childOwner, uint32(PARENT_CANNOT_CONTROL), 0);
        
        // 1000 => 1010 - Parent cannot burn PCC with setSubnodeRecord()
        vm.prank(state.owner);
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", state.childNode));
        nameWrapper.setSubnodeRecord(state.parentNode, state.childLabel, state.childOwner, address(0), 0, uint32(PARENT_CANNOT_CONTROL), 0);
    }
}