// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/resolvers/profiles/ExtendedDNSResolver.sol";
import "../../contracts/resolvers/profiles/IExtendedDNSResolver.sol";
import "../../contracts/resolvers/profiles/IAddressResolver.sol";
import "../../contracts/resolvers/profiles/IAddrResolver.sol";
import "../../contracts/resolvers/profiles/ITextResolver.sol";

/**
 * @title TestExtendedDNSResolver
 * @dev Tests for ExtendedDNSResolver contract functionality
 * Tests the real ExtendedDNSResolver that parses DNS TXT record context data
 */
contract TestExtendedDNSResolver is Test {
    
    ExtendedDNSResolver public resolver;
    
    function setUp() public {
        resolver = new ExtendedDNSResolver();
    }
    
    /**
     * Extended DNS resolver with text context data
     * Tests ExtendedDNSResolver parsing text from context data format t[key]=value
     */
    function testCorrectlyHandlesExtraStringDataInTXTRecordWhenCallingResolverThatSupportsIt() public view {
        bytes memory name = abi.encodePacked("test.test");
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create query for text(bytes32,string) with key "test"
        bytes memory query = abi.encodeWithSignature("text(bytes32,string)", nameHash, "test");
        
        // Create context data: t[test]='foobie bletch' (quoted for spaces)
        bytes memory context = "t[test]='foobie bletch'";
        
        // Call ExtendedDNSResolver.resolve() directly
        bytes memory result = resolver.resolve(name, query, context);
        
        // ExtendedDNSResolver returns abi.encode(string)
        string memory returnedText = abi.decode(result, (string));
        
        // Should return exactly "foobie bletch" from t[test]= context
        assertEq(returnedText, "foobie bletch", "Should return exact text from t[test]= context");
    }
    
    /**
     * Extended resolver with address resolution
     * Tests ExtendedDNSResolver parsing address from context data format a[60]=0xaddress
     */
    function testCorrectlyHandlesExtraDataInTXTRecordWhenCallingResolverThatSupportsAddressResolution() public view {
        bytes memory name = abi.encodePacked("test.test");
        address testAddress = 0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe;
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create query for addr(bytes32) - ETH address resolution
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        
        // Create context data: a[60]=0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe
        bytes memory context = abi.encodePacked("a[60]=", _addressToString(testAddress));
        
        // Call ExtendedDNSResolver.resolve() directly
        bytes memory result = resolver.resolve(name, query, context);
        
        // ExtendedDNSResolver returns abi.encode(address)
        address returnedAddress = abi.decode(result, (address));
        
        // Should parse and return the address from a[60]= format
        assertEq(returnedAddress, testAddress, "Should parse address from a[60]= format");
    }
    
    /**
     * Valid coin type in extended resolver
     * Tests ExtendedDNSResolver with matching coin type
     */
    function testCorrectlyHandlesExtraDataInTXTRecordWhenCallingResolverThatSupportsAddressResolutionWithValidCointype() public view {
        bytes memory name = abi.encodePacked("test.test");
        address testAddress = 0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe;
        uint256 ethCoinType = 60;
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create query for addr(bytes32,uint256) with coin type 60 (ETH)
        bytes memory query = abi.encodeWithSignature("addr(bytes32,uint256)", nameHash, ethCoinType);
        
        // Create context data: a[60]=0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe
        bytes memory context = abi.encodePacked("a[60]=", _addressToString(testAddress));
        
        // Call ExtendedDNSResolver.resolve() directly
        bytes memory result = resolver.resolve(name, query, context);
        
        // ExtendedDNSResolver returns abi.encode(address)
        address returnedAddress = abi.decode(result, (address));
        
        // Should return address when coin type matches (60 = ETH)
        assertEq(returnedAddress, testAddress, "Should return address for matching coin type");
    }
    
    /**
     * Invalid coin type handling
     * Tests ExtendedDNSResolver with mismatched coin type
     */
    function testHandlesExtraDataInTXTRecordWhenCallingResolverThatSupportsAddressResolutionWithInvalidCointype() public view {
        bytes memory name = abi.encodePacked("test.test");
        address testAddress = 0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe;
        uint256 btcCoinType = 0; // Bitcoin coin type
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create query for addr(bytes32,uint256) with coin type 0 (BTC)
        bytes memory query = abi.encodeWithSignature("addr(bytes32,uint256)", nameHash, btcCoinType);
        
        // Create context data: a[60]=0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe (ETH address)
        bytes memory context = abi.encodePacked("a[60]=", _addressToString(testAddress));
        
        // Call ExtendedDNSResolver.resolve() directly
        bytes memory result = resolver.resolve(name, query, context);
        
        // Should return empty bytes for mismatched coin type (request BTC=0, context has ETH=60)
        assertEq(result.length, 0, "Should return empty bytes for mismatched coin type");
    }
    
    /**
     * Raises error for invalid address format
     * Tests ExtendedDNSResolver error handling for malformed hex addresses
     */
    function testRaisesAnErrorIfExtraAddressDataInTheTXTRecordIsInvalid() public {
        bytes memory name = abi.encodePacked("test.test");
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create query for addr(bytes32)
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        
        // Create context data with invalid hex format: a[60]=0xsmth
        bytes memory context = "a[60]=0xsmth";
        
        // Should revert with InvalidAddressFormat error from ExtendedDNSResolver
        vm.expectRevert(abi.encodeWithSignature("InvalidAddressFormat(bytes)", bytes("0xsmth")));
        resolver.resolve(name, query, context);
    }
    
    /**
     * @dev Helper function to convert address to string
     */
    function _addressToString(address addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        return string(str);
    }
}