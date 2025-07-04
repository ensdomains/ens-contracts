// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title IsWrapped
 * @dev IsWrapped functionality tests for NameWrapper
 */
contract IsWrapped is BaseWrapperTest {
    
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    // and constants: ROOT_NODE, ETH_LABEL, ETH_NODE
    
    // Test domains
    string constant TEST_LABEL = "something";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
    string constant SUB_LABEL = "sub";
    bytes32 constant SUB_LABEL_HASH = keccak256(bytes(SUB_LABEL));
    bytes32 constant SUB_NODE = keccak256(abi.encodePacked(TEST_NODE, SUB_LABEL_HASH));
    uint256 constant SUB_NODE_ID = uint256(SUB_NODE);
    
    // Note: BaseWrapperTest provides DAY and MAX_EXPIRY constants
    
    function setUp() public override {
        // Call parent setup - but need to override metadataService to use MockMetadataService
        vm.startPrank(OWNER);
        
        // Deploy core contracts with MockMetadataService for isWrapped tests
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
    
    function testIsWrappedWithNode() public {
        // Initially not wrapped
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Should not be wrapped initially");
        
        _wrapTestDomain();
        
        // Should be wrapped after wrapping
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Should be wrapped after wrapping");
    }
    
    function testIsWrappedWithParentAndLabel() public {
        // Initially not wrapped
        assertFalse(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Should not be wrapped initially");
        
        _wrapTestDomain();
        
        // Should be wrapped after wrapping
        assertTrue(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Should be wrapped after wrapping");
    }
    
    function testIsWrappedForUnregisteredDomain() public view {
        bytes32 unregisteredLabel = keccak256("unregistered");
        bytes32 unregisteredNode = keccak256(abi.encodePacked(ETH_NODE, unregisteredLabel));
        
        // Unregistered domain should not be wrapped
        assertFalse(nameWrapper.isWrapped(unregisteredNode), "Unregistered domain should not be wrapped");
        assertFalse(nameWrapper.isWrapped(ETH_NODE, unregisteredLabel), "Unregistered domain should not be wrapped");
    }
    
    function testIsWrappedForRegisteredButNotWrappedDomain() public {
        vm.startPrank(OWNER);
        
        // Register but don't wrap
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        
        // Should not be wrapped
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Registered but not wrapped domain should not be wrapped");
        assertFalse(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Registered but not wrapped domain should not be wrapped");
        
        vm.stopPrank();
    }
    
    function testIsWrappedForSubdomain() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Initially subdomain not wrapped
        assertFalse(nameWrapper.isWrapped(SUB_NODE), "Subdomain should not be wrapped initially");
        assertFalse(nameWrapper.isWrapped(TEST_NODE, SUB_LABEL_HASH), "Subdomain should not be wrapped initially");
        
        // Create subdomain
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );
        
        // Should be wrapped after creation
        assertTrue(nameWrapper.isWrapped(SUB_NODE), "Subdomain should be wrapped after creation");
        assertTrue(nameWrapper.isWrapped(TEST_NODE, SUB_LABEL_HASH), "Subdomain should be wrapped after creation");
        
        vm.stopPrank();
    }
    
    function testIsWrappedAfterUnwrap() public {
        _wrapTestDomain();
        
        // Should be wrapped
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Should be wrapped");
        assertTrue(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Should be wrapped");
        
        vm.startPrank(OWNER);
        
        // Unwrap domain
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);
        
        // Should not be wrapped after unwrapping
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Should not be wrapped after unwrapping");
        assertFalse(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Should not be wrapped after unwrapping");
        
        vm.stopPrank();
    }
    
    function testIsWrappedForExpiredDomain() public {
        _wrapTestDomain();
        
        // Should be wrapped initially
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Should be wrapped initially");
        assertTrue(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Should be wrapped initially");
        
        // Advance time past expiry + grace period
        uint256 registrationExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        vm.warp(registrationExpiry + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Should not be wrapped after expiration
        assertFalse(nameWrapper.isWrapped(TEST_NODE), "Should not be wrapped after expiration");
        assertFalse(nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH), "Should not be wrapped after expiration");
    }
    
    function testIsWrappedForSubdomainWithExpiredParent() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain with CANNOT_UNWRAP to allow setting child fuses
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Create subdomain with PARENT_CANNOT_CONTROL
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            SUB_LABEL,
            ACCOUNT,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Should be wrapped initially
        assertTrue(nameWrapper.isWrapped(SUB_NODE), "Subdomain should be wrapped initially");
        assertTrue(nameWrapper.isWrapped(TEST_NODE, SUB_LABEL_HASH), "Subdomain should be wrapped initially");
        
        vm.stopPrank();
        
        // Advance time past parent expiry + grace period
        uint256 registrationExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        vm.warp(registrationExpiry + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Subdomain should not be wrapped when parent is expired
        assertFalse(nameWrapper.isWrapped(SUB_NODE), "Subdomain should not be wrapped when parent expired");
        assertFalse(nameWrapper.isWrapped(TEST_NODE, SUB_LABEL_HASH), "Subdomain should not be wrapped when parent expired");
    }
    
    function testIsWrappedForUnknownTLD() public view {
        bytes32 unknownTLD = keccak256("unknown");
        bytes32 unknownNode = keccak256(abi.encodePacked(ROOT_NODE, unknownTLD));
        
        // Unknown TLD should not be wrapped
        assertFalse(nameWrapper.isWrapped(unknownNode), "Unknown TLD should not be wrapped");
        assertFalse(nameWrapper.isWrapped(ROOT_NODE, unknownTLD), "Unknown TLD should not be wrapped");
    }
    
    function testIsWrappedConsistencyBetweenOverloads() public {
        // Test consistency between the two isWrapped overloads
        
        // Before wrapping
        bool result1a = nameWrapper.isWrapped(TEST_NODE);
        bool result1b = nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH);
        assertEq(result1a, result1b, "Results should be consistent before wrapping");
        
        _wrapTestDomain();
        
        // After wrapping
        bool result2a = nameWrapper.isWrapped(TEST_NODE);
        bool result2b = nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH);
        assertEq(result2a, result2b, "Results should be consistent after wrapping");
        assertTrue(result2a, "Should be wrapped");
        
        vm.startPrank(OWNER);
        nameWrapper.unwrapETH2LD(TEST_LABEL_HASH, OWNER, OWNER);
        vm.stopPrank();
        
        // After unwrapping
        bool result3a = nameWrapper.isWrapped(TEST_NODE);
        bool result3b = nameWrapper.isWrapped(ETH_NODE, TEST_LABEL_HASH);
        assertEq(result3a, result3b, "Results should be consistent after unwrapping");
        assertFalse(result3a, "Should not be wrapped");
    }
}
