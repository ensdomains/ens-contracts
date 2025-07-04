// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/OffchainDNSResolver.sol";
import "../../contracts/dnssec-oracle/DNSSECImpl.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";

/**
 * @title TestOffchainDNSResolverBasic
 * @dev Basic compilation and deployment test for OffchainDNSResolver
 */
contract TestOffchainDNSResolverBasic is Test {
    OffchainDNSResolver public offchainDnsResolver;
    DNSSECImpl public dnssec;
    ENSRegistry public ensRegistry;
    
    string constant OFFCHAIN_GATEWAY = "https://localhost:8000/query";
    
    function setUp() public {
        // Deploy ENS Registry
        ensRegistry = new ENSRegistry();
        
        // Deploy DNSSEC implementation with minimal trust anchors
        bytes memory trustAnchors = hex"00";
        dnssec = new DNSSECImpl(trustAnchors);
        
        // Deploy OffchainDNSResolver
        offchainDnsResolver = new OffchainDNSResolver(
            ensRegistry,
            dnssec,
            OFFCHAIN_GATEWAY
        );
    }
    
    function testOffchainResolverDeployment() public view {
        // Test that offchain resolver is properly deployed and configured
        assertEq(address(offchainDnsResolver.ens()), address(ensRegistry), "ENS registry should be set");
        assertEq(address(offchainDnsResolver.oracle()), address(dnssec), "DNSSEC oracle should be set");
        assertEq(offchainDnsResolver.gatewayURL(), OFFCHAIN_GATEWAY, "Gateway URL should be set");
    }
    
    function testSupportsInterface() public view {
        // Test that resolver supports expected interfaces
        
        // Should support IExtendedResolver
        assertTrue(
            offchainDnsResolver.supportsInterface(type(IExtendedResolver).interfaceId),
            "Should support IExtendedResolver"
        );
    }
    
    function testResolveTriggersOffchainLookup() public {
        // Test that resolve() triggers OffchainLookup error for CCIP-Read
        
        bytes memory testName = hex"047465737404746573740000"; // test.test
        bytes memory queryData = abi.encodeWithSignature("addr(bytes32)", bytes32(0));
        
        // Should trigger OffchainLookup error with gateway URL
        // Constructing expected OffchainLookup error data
        string[] memory urls = new string[](1);
        urls[0] = OFFCHAIN_GATEWAY;
        
        // Expected gateway call data (DNS resolve for test.test TXT records)
        bytes memory expectedData = abi.encodeWithSignature("resolve(bytes,uint16)", testName, uint16(16));
        
        // Expected extraData for resolveCallback
        bytes memory expectedExtraData = abi.encode(testName, queryData, bytes4(0x00000000));
        
        vm.expectRevert(
            abi.encodeWithSignature(
                "OffchainLookup(address,string[],bytes,bytes4,bytes)",
                address(offchainDnsResolver),
                urls,
                expectedData,
                OffchainDNSResolver.resolveCallback.selector,
                expectedExtraData
            )
        );
        offchainDnsResolver.resolve(testName, queryData);
    }
}