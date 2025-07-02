// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/registry/TestRegistrar.sol";

// Import utility libraries
import {ENSTestUtils} from "../utils/ENSTestUtils.sol";
import {ENSTestConstants} from "../utils/ENSTestConstants.sol";
import {TestAccounts} from "../utils/TestAccounts.sol";

/**
 * @title TestTestRegistrar
 * @dev Tests TestRegistrar functionality including time-limited registrations and re-registration after expiry
 */
contract TestTestRegistrar is Test {
    ENSRegistry public ensRegistry;
    TestRegistrar public testRegistrar;
    
    address public account0;
    address public account1;
    
    bytes32 constant ZERO_HASH = ENSTestConstants.ZERO_HASH;
    uint256 constant TEST_PERIOD = 28 days; // 28 * 24 * 60 * 60
    
    function setUp() public {
        // Create test accounts
        account0 = TestAccounts.owner();
        account1 = TestAccounts.account1();
        
        ensRegistry = new ENSRegistry();
        testRegistrar = new TestRegistrar(ensRegistry, ZERO_HASH);
        
        // Set registrar as owner of root node
        ensRegistry.setOwner(ZERO_HASH, address(testRegistrar));
        
        vm.label(account0, "account0");
        vm.label(account1, "account1");
    }
    
    function labelhash(string memory label) internal pure returns (bytes32) {
        return ENSTestUtils.labelhash(label);
    }
    
    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }
    
    /**
     * Test 1: 'registers names'
     * Tests basic name registration functionality
     */
    function testRegistersNames() public {
        testRegistrar.register(labelhash("eth"), account0);
        
        assertEq(ensRegistry.owner(ZERO_HASH), address(testRegistrar), "Root should be owned by registrar");
        assertEq(ensRegistry.owner(namehash("eth")), account0, "ETH node should be owned by account0");
    }
    
    /**
     * Test 2: 'forbids transferring names within the test period'
     * Tests that names cannot be re-registered during the test period
     */
    function testForbidsTransferringNamesWithinTheTestPeriod() public {
        // Register 'eth' to account1 first
        testRegistrar.register(labelhash("eth"), account1);
        
        // Try to register 'eth' to account0 immediately - should revert without reason
        vm.expectRevert(bytes(""));
        testRegistrar.register(labelhash("eth"), account0);
    }
    
    /**
     * Test 3: 'allows claiming a name after the test period expires'
     * Tests that names can be re-registered after the 28-day test period
     */
    function testAllowsClaimingANameAfterTheTestPeriodExpires() public {
        // Register 'eth' to account1 first
        testRegistrar.register(labelhash("eth"), account1);
        
        // Verify initial registration
        assertEq(ensRegistry.owner(namehash("eth")), account1, "ETH node should initially be owned by account1");
        
        // Fast forward time by 28 days + 1 second
        vm.warp(block.timestamp + TEST_PERIOD + 1);
        
        // Now account0 should be able to claim it
        testRegistrar.register(labelhash("eth"), account0);
        
        // Verify the transfer worked
        assertEq(ensRegistry.owner(namehash("eth")), account0, "ETH node should be owned by account0 after test period");
    }
}
