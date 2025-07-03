// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./BaseWrapperTest.sol";
import "../../contracts/wrapper/StaticMetadataService.sol";

/**
 * @title TestStaticMetadataService
 * @dev Test the StaticMetadataService contract
 */
contract TestStaticMetadataService is BaseWrapperTest {
    // Note: BaseWrapperTest already provides StaticMetadataService via metadataService
    // and uses OWNER constant instead of owner
    
    function setUp() public override {
        // Call parent setup which deploys StaticMetadataService with "https://ens.domains"
        super.setUp();
    }
    
    // Test 1: "uri() returns url"
    function testUriReturnsUrl() public view {
        // Should return the same URL regardless of token ID (static)
        string memory uri = nameWrapper.uri(123);
        assertEq(uri, "https://ens.domains", "URI should return the static URL");
        
        // Test with different token ID - should return same URL
        string memory uri2 = nameWrapper.uri(456);
        assertEq(uri2, "https://ens.domains", "URI should return the same static URL for any token ID");
        
        // Test with zero token ID
        string memory uri3 = nameWrapper.uri(0);
        assertEq(uri3, "https://ens.domains", "URI should return the same static URL for zero token ID");
    }
    
    // Test 2: "owner can set a new MetadataService"
    function testOwnerCanSetNewMetadataService() public {
        // Deploy a new metadata service
        StaticMetadataService newMetadataService = new StaticMetadataService("https://new.example.com");
        
        vm.prank(OWNER);
        nameWrapper.setMetadataService(IMetadataService(address(newMetadataService)));
        
        // Verify the metadata service was changed
        assertEq(address(nameWrapper.metadataService()), address(newMetadataService), "Metadata service should be updated");
        
        // Verify URI now returns the new URL
        string memory newUri = nameWrapper.uri(123);
        assertEq(newUri, "https://new.example.com", "URI should return the new metadata service URL");
    }
    
    // Test 3: "non-owner cannot set a new MetadataService"
    function testNonOwnerCannotSetNewMetadataService() public {
        // Deploy a new metadata service
        StaticMetadataService newMetadataService = new StaticMetadataService("https://malicious.example.com");
        
        // Try to set metadata service as non-owner (should revert)
        vm.prank(ACCOUNT);
        vm.expectRevert("Ownable: caller is not the owner");
        nameWrapper.setMetadataService(IMetadataService(address(newMetadataService)));
        
        // Verify the metadata service was NOT changed
        assertEq(address(nameWrapper.metadataService()), address(metadataService), "Metadata service should remain unchanged");
        
        // Verify URI still returns the original URL
        string memory originalUri = nameWrapper.uri(123);
        assertEq(originalUri, "https://ens.domains", "URI should still return the original URL");
    }
    
    // Additional test: Direct StaticMetadataService functionality
    function testStaticMetadataServiceDirectly() public {
        // Test the StaticMetadataService contract directly (not through NameWrapper)
        string memory directUri1 = metadataService.uri(999);
        string memory directUri2 = metadataService.uri(1);
        string memory directUri3 = metadataService.uri(type(uint256).max);
        
        // All should return the same static URI
        assertEq(directUri1, "https://ens.domains", "Direct call should return static URI");
        assertEq(directUri2, "https://ens.domains", "Direct call should return same static URI");
        assertEq(directUri3, "https://ens.domains", "Direct call should return same static URI for max uint");
        
        // All should be equal to each other
        assertEq(directUri1, directUri2, "All direct calls should return identical URIs");
        assertEq(directUri2, directUri3, "All direct calls should return identical URIs");
    }
    
    // Additional test: Constructor with different URIs
    function testConstructorWithDifferentUris() public {
        // Test with empty string
        StaticMetadataService emptyService = new StaticMetadataService("");
        assertEq(emptyService.uri(123), "", "Empty URI constructor should work");
        
        // Test with very long URI
        string memory longUri = "https://very-long-domain-name-that-might-be-used-for-testing-purposes.example.com/with/many/path/segments/and/parameters?param1=value1&param2=value2";
        StaticMetadataService longService = new StaticMetadataService(longUri);
        assertEq(longService.uri(456), longUri, "Long URI constructor should work");
        
        // Test with special characters
        string memory specialUri = "https://example.com/path?query=value&other=test#fragment";
        StaticMetadataService specialService = new StaticMetadataService(specialUri);
        assertEq(specialService.uri(789), specialUri, "Special character URI should work");
    }
    
    // Additional test: Gas efficiency comparison
    function testGasEfficiency() public view {
        uint256 gasBefore = gasleft();
        metadataService.uri(123);
        uint256 gasUsed = gasBefore - gasleft();
        
        // StaticMetadataService should be very gas efficient
        // This is more of a documentation test than a strict requirement
        assertTrue(gasUsed < 10000, "StaticMetadataService should be gas efficient");
    }
}