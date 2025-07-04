// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title UnwrapETH2LD
 * @dev UnwrapETH2LD functionality tests for NameWrapper
 */
contract UnwrapETH2LD is BaseWrapperTest {
    
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE
    
    // Additional test accounts
    address constant CONTROLLER = address(0x6);
    address constant REGISTRANT = address(0x7);
    address constant OPERATOR = address(0x8);
    address constant UNAUTHORIZED = address(0x9);
    
    // Test domains
    string constant TEST_LABEL = "unwrapped";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
    // Note: BaseWrapperTest provides DAY and MAX_EXPIRY constants
    // Note: BaseWrapperTest provides standard events: NameUnwrapped, TransferSingle, etc.
    
    function setUp() public override {
        // Call parent setup - but need to override metadataService to use MockMetadataService
        vm.startPrank(OWNER);
        
        // Deploy core contracts with MockMetadataService for unwrap tests
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
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDByOwner() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Verify domain is wrapped
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Domain should be wrapped");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), OWNER, "Should own wrapped domain");
        assertEq(ens.owner(TEST_NODE), address(nameWrapper), "ENS should show wrapper as owner");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), address(nameWrapper), "Registrar should show wrapper as owner");
        
        // Unwrap domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Verify domain is unwrapped
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Domain should be unwrapped");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), address(0), "Wrapper should not own domain");
        assertEq(ens.owner(TEST_NODE), CONTROLLER, "ENS should show CONTROLLER as owner");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), REGISTRANT, "Registrar should show REGISTRANT as owner");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDByOperator() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();
        
        vm.startPrank(OPERATOR);
        
        // Unwrap domain as operator
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Verify domain is unwrapped
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Domain should be unwrapped by operator");
        assertEq(ens.owner(TEST_NODE), CONTROLLER, "ENS should show CONTROLLER as owner");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), REGISTRANT, "Registrar should show REGISTRANT as owner");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDByUnauthorized() public {
        _wrapTestDomain();
        
        vm.startPrank(UNAUTHORIZED);
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDEmitsEvents() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Expect TransferSingle event (burn) first
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(OWNER, OWNER, address(0), TEST_NODE_ID, 1);
        
        // Expect NameUnwrapped event second
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(TEST_NODE, CONTROLLER);
        
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDSameAddresses() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Unwrap with same address for controller and registrant
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);
        
        // Verify both roles assigned to same address
        assertEq(ens.owner(TEST_NODE), OWNER, "ENS should show OWNER as controller");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), OWNER, "Registrar should show OWNER as registrant");
        
        vm.stopPrank();
    }
    
    function testCannotUnwrapETH2LDWithCannotUnwrapFuse() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain with CANNOT_UNWRAP fuse
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Try to unwrap - should fail
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        vm.stopPrank();
    }
    
    function testCannotUnwrapETH2LDExpiredDomain() public {
        vm.startPrank(OWNER);
        
        // Register domain with short expiry
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Advance time past expiry
        vm.warp(block.timestamp + 2 days);
        
        // Try to unwrap expired domain - should fail
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, OWNER));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDRetainsFusesAndExpiry() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain (automatically gets PARENT_CANNOT_CONTROL and IS_DOT_ETH)
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Get original fuses and expiry
        (, uint32 fusesBefore, uint64 expiryBefore) = nameWrapper.getData(TEST_NODE_ID);
        
        // Unwrap the domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Check that fuses and expiry are retained in wrapper storage
        (, uint32 fusesAfter, uint64 expiryAfter) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(fusesAfter, fusesBefore, "Fuses should be retained");
        assertEq(expiryAfter, expiryBefore, "Expiry should be retained");
        
        // But domain should be unwrapped
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Domain should be unwrapped");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDChangesBalances() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Check initial balances
        assertEq(nameWrapper.balanceOf(OWNER, TEST_NODE_ID), 1, "OWNER should have token");
        
        // Unwrap
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Check balances after unwrap (token is burned)
        assertEq(nameWrapper.balanceOf(OWNER, TEST_NODE_ID), 0, "OWNER should not have token");
        // Token is effectively burned - no longer exists in the wrapper
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDClearsApprovals() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Set approval
        nameWrapper.approve(OPERATOR, TEST_NODE_ID);
        assertEq(nameWrapper.getApproved(TEST_NODE_ID), OPERATOR, "Should be approved");
        
        // Unwrap
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Check approval is cleared
        assertEq(nameWrapper.getApproved(TEST_NODE_ID), address(0), "Approval should be cleared");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDReclaim() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Verify initial state
        assertEq(ens.owner(TEST_NODE), address(nameWrapper), "ENS should show wrapper as owner");
        
        // Unwrap and reclaim
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Verify reclaim worked
        assertEq(ens.owner(TEST_NODE), CONTROLLER, "ENS should show CONTROLLER after reclaim");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), REGISTRANT, "Registrar should show REGISTRANT");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDDifferentAddresses() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Unwrap with different controller and registrant
        address controller = address(0x111);
        address registrant = address(0x222);
        
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, registrant, controller);
        
        // Verify different addresses are set
        assertEq(ens.owner(TEST_NODE), controller, "ENS should show different controller");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), registrant, "Registrar should show different registrant");
        assertNotEq(controller, registrant, "Controller and registrant should be different");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDMaintainsRegistrarState() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Get initial registrar expiry
        uint256 initialExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        // Unwrap
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Verify registrar state is maintained
        uint256 finalExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        assertEq(finalExpiry, initialExpiry, "Registrar expiry should be maintained");
        assertTrue(baseRegistrar.available(TEST_LABEL_ID) == false, "Domain should not be available");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDResetsWrapperState() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Verify initial wrapped state
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Should be wrapped initially");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), OWNER, "Should own token initially");
        
        // Unwrap
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Verify wrapper state is reset
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Should not be wrapped after unwrap");
        
        // Check with both isWrapped overloads
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Node-based isWrapped should return false");
        assertFalse(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Parent/label-based isWrapped should return false");
        
        vm.stopPrank();
    }
    
    // Authorization boundary tests
    
    function testUnwrapETH2LDDoesNotAllowBaseRegistrarApproval() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        // Give someone approval on the base registrar
        baseRegistrar.setApprovalForAll(UNAUTHORIZED, true);
        vm.stopPrank();
        
        vm.startPrank(UNAUTHORIZED);
        // Should fail even though they have approval on base registrar
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDDoesNotAllowEnsRegistryApproval() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        // Give someone approval on the ENS registry
        ens.setApprovalForAll(UNAUTHORIZED, true);
        vm.stopPrank();
        
        vm.startPrank(UNAUTHORIZED);
        // Should fail even though they have approval on ENS registry
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDDoesNotAllowIndividualApproval() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        // Give someone individual token approval (ERC721-style)
        nameWrapper.approve(UNAUTHORIZED, TEST_NODE_ID);
        vm.stopPrank();
        
        vm.startPrank(UNAUTHORIZED);
        // Should fail even though they have individual token approval
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDAuthorizationIsolation() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        // Give comprehensive approvals across all systems
        baseRegistrar.setApprovalForAll(UNAUTHORIZED, true);
        ens.setApprovalForAll(UNAUTHORIZED, true);
        nameWrapper.approve(UNAUTHORIZED, TEST_NODE_ID);
        vm.stopPrank();
        
        vm.startPrank(UNAUTHORIZED);
        // Should still fail - only NameWrapper operator approval should work
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        vm.stopPrank();
        
        vm.startPrank(OWNER);
        // Now give proper NameWrapper operator approval
        nameWrapper.setApprovalForAll(UNAUTHORIZED, true);
        vm.stopPrank();
        
        vm.startPrank(UNAUTHORIZED);
        // Now it should work
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDClearsIndividualApprovals() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Set individual approval
        nameWrapper.approve(APPROVED, TEST_NODE_ID);
        assertEq(nameWrapper.getApproved(TEST_NODE_ID), APPROVED, "Should be approved");
        
        // Unwrap
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, REGISTRANT, CONTROLLER);
        
        // Check individual approval is cleared
        assertEq(nameWrapper.getApproved(TEST_NODE_ID), address(0), "Individual approval should be cleared");
        
        vm.stopPrank();
    }
    
    function testUnwrapETH2LDFailsAfterOperatorApprovalRevoked() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OPERATOR, true);
        
        // Wrap another test domain to test with
        string memory testLabel2 = "unwrapped2";
        bytes32 testLabelHash2 = keccak256(bytes(testLabel2));
        uint256 testLabelId2 = uint256(testLabelHash2);
        bytes32 testNode2 = keccak256(abi.encodePacked(ETH_NODE, testLabelHash2));
        
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(testLabelId2, OWNER, 365 days);
        nameWrapper.wrapETH2LD(testLabel2, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Revoke operator approval
        nameWrapper.setApprovalForAll(OPERATOR, false);
        vm.stopPrank();
        
        vm.startPrank(OPERATOR);
        // Should fail now that approval is revoked
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", testNode2, OPERATOR));
        nameWrapper.unwrapETH2LD(testLabelHash2, REGISTRANT, CONTROLLER);
        vm.stopPrank();
    }
}

