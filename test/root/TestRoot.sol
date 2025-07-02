// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";

/**
 * @title TestRoot
 * @dev Comprehensive tests for Root contract functionality
 */
contract TestRoot is BaseTest {
    
    // Note: BaseTest provides: ens, baseRegistrar, controller, priceOracle, dummyOracle, 
    // nameWrapper, metadataService, reverseRegistrar, publicResolver, root
    // and standard accounts: USER1, USER2, USER3
    // and constants: ZERO_HASH, ETH_NODE, REVERSE_NODE, ADDR_REVERSE_NODE, DAY, REGISTRATION_TIME
    
    // Use accounts from TestAccounts (BaseTest provides USER1, USER2, USER3)
    address OWNER = TestAccounts.owner();
    
    // Use constants from ENSTestConstants
    bytes32 constant ETH_LABEL = ENSTestConstants.ETH_LABEL;
    
    // Events
    event TLDLocked(bytes32 indexed label);
    
    function setUp() public override {
        super.setUp();
        
        // BaseTest already sets up the contracts and basic configuration
        // Root contract is already deployed and configured with OWNER as controller
        // ETH domain is already set up under the Root contract
    }
    
    function testSetSubnodeOwnerAsController() public {
        // Should allow controllers to set subnodes
        vm.prank(OWNER);
        root.setSubnodeOwner(ETH_LABEL, USER1);
        
        address owner = ens.owner(ETH_NODE);
        assertEq(owner, USER1, "ETH node should be owned by USER1");
    }
    
    function testSetSubnodeOwnerAsNonController() public {
        // Should fail when non-controller tries to set subnode
        vm.prank(USER1);
        vm.expectRevert("Controllable: Caller is not a controller");
        root.setSubnodeOwner(ETH_LABEL, USER2);
    }
    
    function testLockTLD() public {
        // Test locking a TLD - needs to be done as owner of Root contract
        assertFalse(root.locked(ETH_LABEL), "ETH should not be locked initially");
        
        // Use the actual owner from BaseTest
        vm.prank(OWNER);
        root.lock(ETH_LABEL);
        
        assertTrue(root.locked(ETH_LABEL), "ETH should be locked after calling lock");
    }
    
    function testSetSubnodeOwnerOnLockedTLD() public {
        // Should not allow setting a locked TLD
        // Lock as owner
        vm.prank(OWNER);
        root.lock(ETH_LABEL);
        
        // Try to set subnode as controller - should fail because TLD is locked
        // expects revert with no reason
        vm.prank(OWNER);
        vm.expectRevert();
        root.setSubnodeOwner(ETH_LABEL, USER1);
    }
    
    function testControllerManagement() public {
        // Test controller management
        assertFalse(root.controllers(USER1), "USER1 should not be controller initially");
        
        vm.prank(OWNER);
        root.setController(USER1, true);
        assertTrue(root.controllers(USER1), "USER1 should be controller after setting");
        
        // USER1 should now be able to set subnodes
        vm.prank(USER1);
        root.setSubnodeOwner(ETH_LABEL, USER2);
        assertEq(ens.owner(ETH_NODE), USER2, "USER1 as controller should be able to set subnode");
        
        // Remove controller
        vm.prank(OWNER);
        root.setController(USER1, false);
        assertFalse(root.controllers(USER1), "USER1 should not be controller after removal");
        
        // USER1 should no longer be able to set subnodes
        vm.prank(USER1);
        vm.expectRevert("Controllable: Caller is not a controller");
        root.setSubnodeOwner(ETH_LABEL, USER2);
    }
    
    // Missing tests for complete coverage
    
    function testSetResolverAsOwner() public {
        // Should allow owner to set resolver for root node
        address testResolver = address(0x1234567890123456789012345678901234567890);
        
        vm.prank(OWNER);
        root.setResolver(testResolver);
        
        address currentResolver = ens.resolver(ZERO_HASH);
        assertEq(currentResolver, testResolver, "Root resolver should be set to testResolver");
    }
    
    function testSetResolverAsNonOwner() public {
        // Should fail when non-owner tries to set resolver
        address testResolver = address(0x1234567890123456789012345678901234567890);
        
        vm.prank(USER1);
        vm.expectRevert("Ownable: caller is not the owner");
        root.setResolver(testResolver);
    }
    
    function testSetResolverToZeroAddress() public {
        // Should allow setting resolver to zero address
        vm.prank(OWNER);
        root.setResolver(address(0));
        
        address currentResolver = ens.resolver(ZERO_HASH);
        assertEq(currentResolver, address(0), "Root resolver should be set to zero address");
    }
    
    function testSetResolverMultipleTimes() public {
        // Should allow setting resolver multiple times
        address resolver1 = address(0x1111111111111111111111111111111111111111);
        address resolver2 = address(0x2222222222222222222222222222222222222222);
        
        vm.prank(OWNER);
        root.setResolver(resolver1);
        assertEq(ens.resolver(ZERO_HASH), resolver1, "Should set first resolver");
        
        vm.prank(OWNER);
        root.setResolver(resolver2);
        assertEq(ens.resolver(ZERO_HASH), resolver2, "Should set second resolver");
    }
    
    function testSupportsInterfaceMetaID() public {
        // Should return true for INTERFACE_META_ID (0x01ffc9a7)
        bytes4 metaID = bytes4(keccak256("supportsInterface(bytes4)"));
        assertTrue(root.supportsInterface(metaID), "Should support EIP-165 meta interface");
    }
    
    function testSupportsInterfaceRandomID() public {
        // Should return false for random interface ID
        bytes4 randomID = 0x12345678;
        assertFalse(root.supportsInterface(randomID), "Should not support random interface");
    }
    
    function testSupportsInterfaceZeroID() public {
        // Should return false for zero interface ID
        bytes4 zeroID = 0x00000000;
        assertFalse(root.supportsInterface(zeroID), "Should not support zero interface");
    }
    
    function testSupportsInterfaceAllOnesID() public {
        // Should return false for all-ones interface ID
        bytes4 allOnesID = 0xffffffff;
        assertFalse(root.supportsInterface(allOnesID), "Should not support all-ones interface");
    }
    
    function testLockAsNonOwner() public {
        // Should fail when non-owner tries to lock TLD
        vm.prank(USER1);
        vm.expectRevert("Ownable: caller is not the owner");
        root.lock(ETH_LABEL);
    }
    
    function testLockEmitsEvent() public {
        // Should emit TLDLocked event when locking
        vm.expectEmit(true, false, false, false);
        emit TLDLocked(ETH_LABEL);
        vm.prank(OWNER);
        root.lock(ETH_LABEL);
    }
    
    function testLockMultipleTLDs() public {
        // Should allow locking multiple TLDs
        bytes32 testLabel1 = keccak256("test1");
        bytes32 testLabel2 = keccak256("test2");
        
        vm.prank(OWNER);
        root.lock(testLabel1);
        vm.prank(OWNER);
        root.lock(testLabel2);
        
        assertTrue(root.locked(testLabel1), "test1 should be locked");
        assertTrue(root.locked(testLabel2), "test2 should be locked");
    }
    
    function testLockAlreadyLockedTLD() public {
        // Should allow locking an already locked TLD (idempotent)
        vm.prank(OWNER);
        root.lock(ETH_LABEL);
        assertTrue(root.locked(ETH_LABEL), "ETH should be locked first time");
        
        // Lock again - should not revert
        vm.prank(OWNER);
        root.lock(ETH_LABEL);
        assertTrue(root.locked(ETH_LABEL), "ETH should still be locked after second lock");
    }
    
    function testSetSubnodeOwnerWithCustomLabels() public {
        // Test setting subnodes with various custom labels
        bytes32 customLabel = keccak256("custom");
        bytes32 customNode = keccak256(abi.encodePacked(ZERO_HASH, customLabel));
        
        vm.prank(OWNER);
        root.setSubnodeOwner(customLabel, USER1);
        
        assertEq(ens.owner(customNode), USER1, "Custom node should be owned by USER1");
    }
}