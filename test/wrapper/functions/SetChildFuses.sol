// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../../contracts/wrapper/INameWrapper.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title SetChildFuses
 * @dev SetChildFuses functionality tests for NameWrapper
 */
contract SetChildFuses is Test {
    
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
    event FusesSet(bytes32 indexed node, uint32 fuses);
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
    
    function _wrapParentWithChild() internal {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain with CANNOT_UNWRAP
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Create child subdomain with no fuses initially
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            0,
            0
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesByParentOwner() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Check initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, 0, "Child should have no fuses initially");
        assertEq(initialExpiry, 0, "Child should have no expiry initially");
        
        // Set child fuses
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Check fuses were set
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(newFuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP fuse");
        assertTrue(newFuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        
        // Check expiry is normalized to parent expiry
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(newExpiry, parentExpiry + baseRegistrar.GRACE_PERIOD(), "Child expiry should be parent expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testSetChildFusesByOperator() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();
        
        vm.startPrank(OPERATOR);
        
        // Set child fuses as approved operator
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Check fuses were set
        (, uint32 newFuses,) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(newFuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP fuse");
        assertTrue(newFuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesByUnauthorized() public {
        _wrapParentWithChild();
        
        vm.startPrank(UNAUTHORIZED);
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesIsDotEth() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Try to set IS_DOT_ETH fuse - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesParentControlledFusesWithoutPCC() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Set parent-controlled fuses without PCC (should work)
        uint32 parentControlledFuse = IS_DOT_ETH * 2; // Next undefined parent controlled fuse
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            parentControlledFuse,
            MAX_EXPIRY
        );
        
        // Check fuse was set
        (, uint32 newFuses,) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(newFuses & parentControlledFuse != 0, "Should have parent controlled fuse");
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesParentControlledAfterPCC() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // First set PCC
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Try to set parent-controlled fuses after PCC - should fail
        uint32 parentControlledFuse = IS_DOT_ETH * 2;
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            parentControlledFuse,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesWithoutCannotUnwrap() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Try to set fuses without CANNOT_UNWRAP - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesWithoutPCC() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Try to set CANNOT_UNWRAP without PARENT_CANNOT_CONTROL - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesNormalizesExpiryToParent() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Set child fuses with MAX_EXPIRY
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Check expiry is normalized to parent expiry
        (, , uint64 childExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        (, , uint64 parentExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(childExpiry, parentExpiry, "Child expiry should be normalized to parent expiry");
        
        vm.stopPrank();
    }
    
    function testSetChildFusesNormalizesExpiryToOldExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Create child subdomain with specific expiry
        uint64 childExpiry = uint64(block.timestamp + 1000);
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            0,
            childExpiry
        );
        
        // Try to set lower expiry - should normalize to old expiry
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            uint64(500)
        );
        
        // Check expiry remains the same
        (, , uint64 newExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(newExpiry, childExpiry, "Expiry should remain at old value");
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesOnETHDomain() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Try to call setChildFuses on .eth domain - should fail
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", ETH_NODE, OWNER));
        nameWrapper.setChildFuses(
            ETH_NODE,
            TEST_LABEL_HASH,
            CANNOT_SET_RESOLVER,
            0
        );
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesAfterPCCBurned() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Set PCC and CANNOT_UNWRAP
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );
        
        // Try to set additional fuses after PCC burned - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_SET_RESOLVER | CANNOT_BURN_FUSES,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesWithoutParentCannotUnwrap() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain without CANNOT_UNWRAP
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Create child subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            0,
            0
        );
        
        // Try to set PCC without parent having CANNOT_UNWRAP - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesEmitsEvents() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        uint256 parentExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        uint64 expectedExpiry = uint64(parentExpiry + baseRegistrar.GRACE_PERIOD());
        
        // Expect FusesSet event
        vm.expectEmit(true, false, false, true);
        emit FusesSet(CHILD_NODE, CANNOT_UNWRAP | PARENT_CANNOT_CONTROL);
        
        // Expect ExpiryExtended event
        vm.expectEmit(true, false, false, true);
        emit ExpiryExtended(CHILD_NODE, expectedExpiry);
        
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesExpiredChild() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Set child fuses with zero expiry (expired)
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_SET_RESOLVER,
            0
        );
        
        // Check child is expired (owner is zero, fuses are reset)
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(owner, address(0), "Expired child should have zero owner");
        assertEq(fuses, 0, "Expired child should have zero fuses");
        assertEq(expiry, 0, "Expired child should have zero expiry");
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesOnExpiredChild() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Set child fuses with zero expiry (expired)
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            0
        );
        
        // Try to set fuses on expired child - should fail
        vm.expectRevert(abi.encodeWithSignature("NameIsNotWrapped()"));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(block.timestamp + DAY)
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesForTLD() public {
        vm.startPrank(OWNER);
        
        // Set up TLD
        string memory tldLabel = "testtld";
        bytes32 tldLabelHash = keccak256(bytes(tldLabel));
        bytes32 tldNode = keccak256(abi.encodePacked(ROOT_NODE, tldLabelHash));
        uint256 tldNodeId = uint256(tldNode);
        
        ens.setSubnodeOwner(ROOT_NODE, tldLabelHash, OWNER);
        ens.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap TLD
        bytes memory tldDnsName = abi.encodePacked(uint8(7), tldLabel, uint8(0));
        nameWrapper.wrap(tldDnsName, OWNER, address(0));
        
        // Set child fuses on TLD (special case for root)
        uint64 expectedExpiry = uint64(block.timestamp + 1000);
        nameWrapper.setChildFuses(
            bytes32(0), // root node
            tldLabelHash,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            expectedExpiry
        );
        
        // Check fuses and expiry
        (, uint32 fuses, uint64 expiry) = nameWrapper.getData(tldNodeId);
        assertTrue(fuses & CANNOT_UNWRAP != 0, "TLD should have CANNOT_UNWRAP fuse");
        assertTrue(fuses & PARENT_CANNOT_CONTROL != 0, "TLD should have PARENT_CANNOT_CONTROL fuse");
        assertEq(expiry, expectedExpiry, "TLD should have correct expiry");
        
        vm.stopPrank();
    }
    
    // Additional test cases
    
    function testCannotSetChildFusesWithPCCAlreadyBurnedEvenIfPCCIncluded() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // First set PCC and CANNOT_UNWRAP
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );
        
        // Try to set fuses including PCC + other fuses even though PCC is already burned - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER, // Including PCC even though already burned
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesWithoutCannotUnwrapEvenWithOtherFuses() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Try to set owner-controlled fuses without CANNOT_UNWRAP - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_SET_RESOLVER, // Owner-controlled fuse without CANNOT_UNWRAP
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesParentControlledOnExpiredWithExpiryExtension() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Verify child starts expired (expiry 0)
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(fuses, 0, "Child should have no fuses initially");
        assertEq(expiry, 0, "Child should have zero expiry (expired)");
        assertEq(owner, CHILD_OWNER, "Child should have correct owner");
        
        // Setting parent-controlled fuses with expiry extension should work
        uint32 parentControlledFuse = IS_DOT_ETH * 2; // Parent controlled fuse
        uint64 newExpiry = uint64(block.timestamp + 1000);
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            parentControlledFuse,
            newExpiry
        );
        
        // Check fuses and expiry were set
        (, uint32 newFuses, uint64 finalExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(newFuses & parentControlledFuse != 0, "Should have parent controlled fuse");
        assertEq(finalExpiry, newExpiry, "Should have new expiry");
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesComplexFuseCombinations() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // Test 1: Try to set CANNOT_UNWRAP with other fuses but without PCC - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | CANNOT_SET_RESOLVER, // Missing PCC
            MAX_EXPIRY
        );
        
        // Test 2: Set initial fuses correctly
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Test 3: Try to add more fuses after PCC is burned - should fail
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_SET_RESOLVER,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testSetChildFusesStateTransitions() public {
        _wrapParentWithChild();
        
        vm.startPrank(OWNER);
        
        // State 1: No fuses initially
        (, uint32 initialFuses,) = nameWrapper.getData(CHILD_NODE_ID);
        assertEq(initialFuses, 0, "Should start with no fuses");
        
        // State 2: Set parent-controlled fuses only (before PCC)
        uint32 parentControlledFuse = IS_DOT_ETH * 2;
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            parentControlledFuse,
            MAX_EXPIRY
        );
        
        (, uint32 stateTwoFuses,) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(stateTwoFuses & parentControlledFuse != 0, "Should have parent controlled fuse");
        assertTrue(stateTwoFuses & PARENT_CANNOT_CONTROL == 0, "Should not have PCC yet");
        
        // State 3: Burn PCC and CANNOT_UNWRAP
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        (, uint32 stateThreeFuses,) = nameWrapper.getData(CHILD_NODE_ID);
        assertTrue(stateThreeFuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP");
        assertTrue(stateThreeFuses & PARENT_CANNOT_CONTROL != 0, "Should have PCC");
        assertTrue(stateThreeFuses & parentControlledFuse != 0, "Should retain parent controlled fuse");
        
        // State 4: Try to modify after PCC - should fail
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_SET_RESOLVER,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
    
    function testCannotSetChildFusesWithInvalidParentState() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap parent domain without CANNOT_UNWRAP fuse
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Create child subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            CHILD_OWNER,
            0,
            0
        );
        
        // Try to set child fuses when parent doesn't have CANNOT_UNWRAP - should fail for owner-controlled fuses
        bytes32 childNode = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", childNode));
        nameWrapper.setChildFuses(
            TEST_NODE,
            CHILD_LABEL_HASH,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
    }
}

