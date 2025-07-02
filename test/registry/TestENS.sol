// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";

/**
 * @title TestENS
 * @dev Tests core ENSRegistry functionality including ownership transfers, resolver setting, TTL management, and subnode creation
 */
contract TestENS is BaseTest {
    
    // Note: BaseTest provides: ens, baseRegistrar, controller, priceOracle, dummyOracle, 
    // nameWrapper, metadataService, reverseRegistrar, publicResolver
    // and standard accounts: USER1, USER2, USER3
    // and constants: ZERO_HASH, ETH_NODE, REVERSE_NODE, ADDR_REVERSE_NODE, DAY, REGISTRATION_TIME
    
    address public account0;
    address public account1;
    
    // Test-specific constants
    address PLACEHOLDER_ADDR = TestAccounts.placeholderAddr();
    bytes32 constant TEST_NODE_01 = 0x0100000000000000000000000000000000000000000000000000000000000000;
    
    // Events from ENSRegistry
    event Transfer(bytes32 indexed node, address owner);
    event NewResolver(bytes32 indexed node, address resolver);
    event NewTTL(bytes32 indexed node, uint64 ttl);
    event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner);
    
    function setUp() public override {
        super.setUp();
        
        // Create test accounts using TestAccounts
        account0 = TestAccounts.account0();
        account1 = TestAccounts.account1();
        
        vm.label(account0, "account0");
        vm.label(account1, "account1");
    }
    
    // Note: labelhash and namehash functions are provided by BaseTest
    
    /**
     * Test 1: 'should allow ownership transfers'
     * Tests basic ownership transfer functionality with event emission
     */
    function testShouldAllowOwnershipTransfers() public {
        // Create a test TLD under root that we can control
        bytes32 testLabel = labelhash("test");
        bytes32 testNode = namehash("test");
        
        // As a Root controller, create a TLD for testing
        vm.prank(TestAccounts.owner());
        root.setSubnodeOwner(testLabel, address(this));
        
        // Now we own the test TLD and can transfer it
        vm.expectEmit(true, true, false, true);
        emit Transfer(testNode, PLACEHOLDER_ADDR);
        
        // Execute transfer
        ens.setOwner(testNode, PLACEHOLDER_ADDR);
        
        // Verify owner is set
        assertEq(ens.owner(testNode), PLACEHOLDER_ADDR, "Owner should be set to placeholder address");
    }
    
    /**
     * Test 2: 'should prohibit transfers by non-owners'
     * Tests that non-owners cannot transfer nodes they don't own
     */
    function testShouldProhibitTransfersByNonOwners() public {
        // Try to transfer TEST_NODE_01 (padHex('0x01', { size: 32 })) as non-owner
        vm.expectRevert(bytes(""));
        ens.setOwner(TEST_NODE_01, PLACEHOLDER_ADDR);
    }
    
    /**
     * Test 3: 'should allow setting resolvers'
     * Tests basic resolver setting functionality with event emission
     */
    function testShouldAllowSettingResolvers() public {
        // Create a test TLD for resolver testing
        bytes32 testLabel = labelhash("resolver");
        bytes32 testNode = namehash("resolver");
        
        // As a Root controller, create a TLD for testing
        vm.prank(TestAccounts.owner());
        root.setSubnodeOwner(testLabel, address(this));
        
        // Expect NewResolver event
        vm.expectEmit(true, true, false, true);
        emit NewResolver(testNode, PLACEHOLDER_ADDR);
        
        // Execute resolver setting
        ens.setResolver(testNode, PLACEHOLDER_ADDR);
        
        // Verify resolver is set
        assertEq(ens.resolver(testNode), PLACEHOLDER_ADDR, "Resolver should be set to placeholder address");
    }
    
    /**
     * Test 4: 'should prevent setting resolvers by non-owners'
     * Tests that non-owners cannot set resolvers on nodes they don't own
     */
    function testShouldPreventSettingResolversByNonOwners() public {
        // Try to set resolver on TEST_NODE_01 as non-owner
        vm.expectRevert(bytes(""));
        ens.setResolver(TEST_NODE_01, PLACEHOLDER_ADDR);
    }
    
    /**
     * Test 5: 'should allow setting the TTL'
     * Tests basic TTL setting functionality with event emission
     */
    function testShouldAllowSettingTheTTL() public {
        // Create a test TLD for TTL testing
        bytes32 testLabel = labelhash("ttltest");
        bytes32 testNode = namehash("ttltest");
        
        // As a Root controller, create a TLD for testing
        vm.prank(TestAccounts.owner());
        root.setSubnodeOwner(testLabel, address(this));
        
        // Expect NewTTL event
        vm.expectEmit(true, true, false, true);
        emit NewTTL(testNode, 3600);
        
        // Execute TTL setting
        ens.setTTL(testNode, 3600);
        
        // Verify TTL is set
        assertEq(ens.ttl(testNode), 3600, "TTL should be set to 3600");
    }
    
    /**
     * Test 6: 'should prevent setting the TTL by non-owners'
     * Tests that non-owners cannot set TTL on nodes they don't own
     */
    function testShouldPreventSettingTheTTLByNonOwners() public {
        // Try to set TTL on TEST_NODE_01 as non-owner
        vm.expectRevert(bytes(""));
        ens.setTTL(TEST_NODE_01, 3600);
    }
    
    /**
     * Test 7: 'should allow the creation of subnodes'
     * Tests subnode creation functionality with event emission
     */
    function testShouldAllowTheCreationOfSubnodes() public {
        // Create a test TLD for subnode testing
        bytes32 parentLabel = labelhash("parent");
        bytes32 parentNode = namehash("parent");
        bytes32 childLabel = labelhash("child");
        bytes32 childNode = namehash("child.parent");
        
        // As a Root controller, create a TLD for testing
        vm.prank(TestAccounts.owner());
        root.setSubnodeOwner(parentLabel, address(this));
        
        // Expect NewOwner event
        vm.expectEmit(true, true, true, true);
        emit NewOwner(parentNode, childLabel, account1);
        
        // Execute subnode creation
        ens.setSubnodeOwner(parentNode, childLabel, account1);
        
        // Verify subnode owner is set
        assertEq(ens.owner(childNode), account1, "Child subnode should be owned by account1");
    }
    
    /**
     * Test 8: 'should prohibit subnode creation by non-owners'
     * Tests that non-owners cannot create subnodes under nodes they don't own
     */
    function testShouldProhibitSubnodeCreationByNonOwners() public {
        bytes32 ethLabel = labelhash("eth");
        
        // Try to create subnode as account1 (non-owner of root)
        vm.prank(account1);
        vm.expectRevert(bytes(""));
        ens.setSubnodeOwner(ZERO_HASH, ethLabel, account1);
    }
}