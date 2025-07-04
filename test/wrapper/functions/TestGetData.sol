// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";

/**
 * @title GetData
 * @dev GetData functionality tests for NameWrapper
 */
contract GetData is BaseWrapperTest {
    
    // Test-specific domain constants
    string constant SUB_LABEL = "sub";
    bytes32 constant SUB_LABEL_HASH = keccak256(bytes(SUB_LABEL));
    bytes32 SUB_NODE;
    uint256 SUB_NODE_ID;
    
    function setUp() public override {
        // Override default label for this test
        defaultLabel = "getdata";
        
        // Call parent setup
        super.setUp();
        
        // Set up test-specific subdomain constants
        SUB_NODE = keccak256(abi.encodePacked(defaultNode, SUB_LABEL_HASH));
        SUB_NODE_ID = uint256(SUB_NODE);
    }
    
    function _wrapTestDomain() internal returns (uint64 expiry) {
        return _wrapDefaultDomain();
    }
    
    function testGetDataBasic() public {
        uint64 wrapExpiry = _wrapTestDomain();
        
        // Get data
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(defaultNodeId);
        
        assertEq(owner, OWNER, "Owner should match");
        assertTrue(fuses & IS_DOT_ETH != 0, "Should have IS_DOT_ETH fuse");
        assertTrue(fuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        assertTrue(expiry > block.timestamp, "Expiry should be in future");
        assertEq(expiry, wrapExpiry, "Expiry should match wrap return value");
    }
    
    function testGetDataWithFuses() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain with CANNOT_UNWRAP
        nameWrapper.wrapETH2LD(defaultLabel, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Set additional fuses
        nameWrapper.setFuses(defaultNode, uint16(CANNOT_TRANSFER | CANNOT_SET_RESOLVER));
        
        // Get data
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(defaultNodeId);
        
        assertEq(owner, OWNER, "Owner should match");
        assertTrue(fuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP fuse");
        assertTrue(fuses & CANNOT_TRANSFER != 0, "Should have CANNOT_TRANSFER fuse");
        assertTrue(fuses & CANNOT_SET_RESOLVER != 0, "Should have CANNOT_SET_RESOLVER fuse");
        assertTrue(fuses & IS_DOT_ETH != 0, "Should have IS_DOT_ETH fuse");
        assertTrue(fuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        
        vm.stopPrank();
    }
    
    function testGetDataSubdomain() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain with CANNOT_UNWRAP to allow setting child fuses
        nameWrapper.wrapETH2LD(defaultLabel, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Create subdomain
        nameWrapper.setSubnodeOwner(
            defaultNode,
            SUB_LABEL,
            ACCOUNT,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        // Get subdomain data
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(SUB_NODE_ID);
        
        assertEq(owner, ACCOUNT, "Subdomain owner should match");
        assertTrue(fuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP fuse");
        assertTrue(fuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        assertFalse(fuses & IS_DOT_ETH != 0, "Should not have IS_DOT_ETH fuse");
        assertTrue(expiry > block.timestamp, "Expiry should be in future");
        
        vm.stopPrank();
    }
    
    function testGetDataNonExistentNode() public {
        bytes32 nonExistentNode = _makeNode(ETH_NODE, "nonexistent");
        uint256 nonExistentNodeId = uint256(nonExistentNode);
        
        // Get data for non-existent node
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(nonExistentNodeId);
        
        assertEq(owner, address(0), "Owner should be zero address");
        assertEq(fuses, 0, "Fuses should be zero");
        assertEq(expiry, 0, "Expiry should be zero");
    }
    
    function testGetDataAfterUnwrap() public {
        _wrapTestDomain();
        
        vm.startPrank(OWNER);
        
        // Verify domain is wrapped before unwrap
        assertTrue(nameWrapper.isWrapped(defaultNode), "Domain should be wrapped initially");
        
        // Unwrap domain
        nameWrapper.unwrapETH2LD(defaultLabelHash, OWNER, OWNER);
        
        // Verify domain is no longer wrapped - this is the key test
        assertFalse(nameWrapper.isWrapped(defaultNode), "Domain should not be wrapped after unwrap");
        
        // Get data after unwrap
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(defaultNodeId);
        
        assertEq(owner, address(0), "Owner should be zero address after unwrap");
        // Note: The wrapper may maintain stale fuse/expiry data for unwrapped domains
        // Applications should use isWrapped() to determine if the domain is actually controlled
        // by the wrapper, rather than relying solely on getData() for unwrapped domains
        
        vm.stopPrank();
    }
    
    function testGetDataExpiredDomain() public {
        _wrapTestDomain();
        
        // Advance time past expiry + grace period
        uint256 registrationExpiry = baseRegistrar.nameExpires(defaultLabelId);
        vm.warp(registrationExpiry + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Get data for expired domain
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(defaultNodeId);
        
        assertEq(owner, address(0), "Owner should be zero for expired domain");
        assertEq(fuses, 0, "Fuses should be zero for expired domain");
        // Expiry should still be the original expiry time
        assertTrue(expiry > 0, "Expiry should still be recorded");
    }
    
    function testGetDataForSubdomainOfExpiredParent() public {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain with CANNOT_UNWRAP to allow setting child fuses
        nameWrapper.wrapETH2LD(defaultLabel, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Create subdomain
        nameWrapper.setSubnodeOwner(
            defaultNode,
            SUB_LABEL,
            ACCOUNT,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        
        vm.stopPrank();
        
        // Advance time past parent expiry + grace period
        uint256 registrationExpiry = baseRegistrar.nameExpires(defaultLabelId);
        vm.warp(registrationExpiry + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Get data for subdomain of expired parent
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(SUB_NODE_ID);
        
        assertEq(owner, address(0), "Subdomain owner should be zero when parent expired");
        assertEq(fuses, 0, "Subdomain fuses should be zero when parent expired");
        // Expiry should still be recorded
        assertTrue(expiry > 0, "Expiry should still be recorded");
    }
    
    function testGetDataConsistency() public {
        _wrapTestDomain();
        
        // Get data multiple times - should be consistent
        (address owner1, uint32 fuses1, uint64 expiry1) = nameWrapper.getData(defaultNodeId);
        (address owner2, uint32 fuses2, uint64 expiry2) = nameWrapper.getData(defaultNodeId);
        
        assertEq(owner1, owner2, "Owner should be consistent");
        assertEq(fuses1, fuses2, "Fuses should be consistent");
        assertEq(expiry1, expiry2, "Expiry should be consistent");
    }
}
