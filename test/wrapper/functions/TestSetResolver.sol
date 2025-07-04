// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title SetResolver
 * @dev SetResolver functionality tests for NameWrapper
 */
contract SetResolver is BaseWrapperTest {
    
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE, DAY, MAX_EXPIRY
    
    // Additional addresses for this test
    address constant RESOLVER = address(0x5);
    address constant UNAUTHORIZED = address(0x6);
    
    // Test domains
    string constant TEST_LABEL = "setresolver";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
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
        
        // Wrap domain with CANNOT_UNWRAP to enable other fuses
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        vm.stopPrank();
    }
    
    function testSetResolverByOwner() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Initially no resolver
        assertEq(ens.resolver(TEST_NODE), address(0), "Should have no resolver initially");
        
        // Set resolver
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        
        // Check resolver was set
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Resolver should be set");
        
        vm.stopPrank();
    }
    
    function testSetResolverByOperator() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        nameWrapper.setApprovalForAll(OTHER, true);
        vm.stopPrank();
        
        vm.startPrank(OTHER);
        
        // Set resolver as operator
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        
        // Check resolver was set
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Resolver should be set by operator");
        
        vm.stopPrank();
    }
    
    function testSetResolverByUnauthorized() public {
        _wrapTestDomain();
        
        vm.startPrank(UNAUTHORIZED);
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        vm.stopPrank();
    }
    
    function testSetResolverToZeroAddress() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // First set a resolver
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Resolver should be set");
        
        // Clear resolver by setting to zero address
        nameWrapper.setResolver(TEST_NODE, address(0));
        assertEq(ens.resolver(TEST_NODE), address(0), "Resolver should be cleared");
        
        vm.stopPrank();
    }
    
    function testSetResolverMultipleTimes() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        address resolver1 = address(0x123);
        address resolver2 = address(0x456);
        
        // Set first resolver
        nameWrapper.setResolver(TEST_NODE, resolver1);
        assertEq(ens.resolver(TEST_NODE), resolver1, "First resolver should be set");
        
        // Change to second resolver
        nameWrapper.setResolver(TEST_NODE, resolver2);
        assertEq(ens.resolver(TEST_NODE), resolver2, "Second resolver should be set");
        
        vm.stopPrank();
    }
    
    function testCannotSetResolverWithCannotSetResolverFuse() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Set CANNOT_SET_RESOLVER fuse
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_SET_RESOLVER));
        
        // Try to set resolver - should fail
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", TEST_NODE));
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        
        vm.stopPrank();
    }
    
    function testSetResolverAfterBurningOtherFuses() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Set other fuses (not CANNOT_SET_RESOLVER)
        nameWrapper.setFuses(TEST_NODE, uint16(CANNOT_TRANSFER | CANNOT_SET_TTL));
        
        // Should still be able to set resolver
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Should be able to set resolver with other fuses burned");
        
        vm.stopPrank();
    }
    
    function testCannotSetResolverOnExpiredDomain() public {
        _wrapTestDomain();
        
        // Advance time past expiry + grace period
        uint256 registrationExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        vm.warp(registrationExpiry + baseRegistrar.GRACE_PERIOD() + 1);
        
        vm.startPrank(OWNER);
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, OWNER));
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        vm.stopPrank();
    }
    
    function testCannotSetResolverOnUnwrappedDomain() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain without CANNOT_UNWRAP so we can unwrap it
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Unwrap domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);
        
        // Try to set resolver through wrapper - should fail
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, OWNER));
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        
        vm.stopPrank();
    }
    
    function testSetResolverForSubdomain() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Create subdomain
        string memory subLabel = "sub";
        bytes32 subNode = nameWrapper.setSubnodeOwner(
            TEST_NODE,
            subLabel,
            OWNER,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );
        
        // Set resolver for subdomain
        nameWrapper.setResolver(subNode, RESOLVER);
        assertEq(ens.resolver(subNode), RESOLVER, "Subdomain resolver should be set");
        
        vm.stopPrank();
    }
    
    function testSetResolverWithApproval() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Approve OTHER for specific token
        nameWrapper.approve(OTHER, TEST_NODE_ID);
        
        vm.stopPrank();
        
        vm.startPrank(OTHER);
        
        // Approved address cannot set resolver (approval is only for limited operations)
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, OTHER));
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        
        vm.stopPrank();
    }
    
    function testSetResolverUpdatesDNSRecord() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Test that setting resolver updates the ENS registry record
        address initialResolver = ens.resolver(TEST_NODE);
        assertEq(initialResolver, address(0), "Initial resolver should be zero");
        
        nameWrapper.setResolver(TEST_NODE, RESOLVER);
        
        address newResolver = ens.resolver(TEST_NODE);
        assertEq(newResolver, RESOLVER, "Resolver should be updated in ENS registry");
        assertNotEq(newResolver, initialResolver, "Resolver should have changed");
        
        vm.stopPrank();
    }
    
    function testSetResolverConsistency() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Set resolver multiple times and verify consistency
        address[] memory resolvers = new address[](3);
        resolvers[0] = address(0x111);
        resolvers[1] = address(0x222);
        resolvers[2] = address(0x333);
        
        for (uint i = 0; i < resolvers.length; i++) {
            nameWrapper.setResolver(TEST_NODE, resolvers[i]);
            assertEq(ens.resolver(TEST_NODE), resolvers[i], "Resolver should be consistent");
        }
        
        vm.stopPrank();
    }
}

