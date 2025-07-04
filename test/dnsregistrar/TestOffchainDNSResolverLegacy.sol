// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/OffchainDNSResolver.sol";
import "./DynamicDNSFixtures.sol";
import "../../contracts/dnssec-oracle/DNSSECImpl.sol";
import "../../contracts/dnssec-oracle/algorithms/DummyAlgorithm.sol";
import "../../contracts/dnssec-oracle/digests/DummyDigest.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/dnsregistrar/mocks/DummyLegacyTextResolver.sol";
import "../../contracts/dnsregistrar/mocks/DummyNonCCIPAwareResolver.sol";
import "../../contracts/resolvers/OwnedResolver.sol";
import "../../contracts/root/Root.sol";
import {DNSSEC} from "../../contracts/dnssec-oracle/DNSSEC.sol";
import "../../contracts/resolvers/profiles/IExtendedDNSResolver.sol";

/**
 * @title TestMockOffchainResolver
 * @dev Mock offchain resolver for testing CCIP-Read functionality
 */
contract TestMockOffchainResolver {
    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IExtendedDNSResolver).interfaceId;
    }

    function resolve(
        bytes calldata /* name */,
        bytes calldata data,
        bytes calldata /* context */
    ) external view returns (bytes memory) {
        string[] memory urls = new string[](1);
        urls[0] = "https://example.com/";
        
        // Revert with OffchainLookup (error already defined by OffchainDNSResolver)
        revert OffchainLookup(
            address(this),
            urls,
            data,
            TestMockOffchainResolver.resolveCallback.selector,
            data
        );
    }

    function addr(bytes32) external pure returns (bytes memory) {
        return abi.encode("onchain");
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        (, bytes memory callData, ) = abi.decode(
            extraData,
            (bytes, bytes, bytes4)
        );
        if (bytes4(callData) == bytes4(keccak256("addr(bytes32)"))) {
            (bytes memory result, , ) = abi.decode(
                response,
                (bytes, uint64, bytes)
            );
            return result;
        }
        return abi.encode(address(this));
    }
}

/**
 * @title TestOffchainDNSResolverLegacy
 * @dev Tests for legacy resolvers and CCIP-Read error handling using OffchainDNSResolver
 */
contract TestOffchainDNSResolverLegacy is Test {
    
    OffchainDNSResolver public resolver;
    ENSRegistry public ens;
    OwnedResolver public ownedResolver;
    Root public root;
    DNSSECImpl public dnssec;
    DummyLegacyTextResolver public legacyResolver;
    DummyNonCCIPAwareResolver public dummyResolver;
    TestMockOffchainResolver public offchainResolver;
    
    address public account0;
    string constant GATEWAY = "https://localhost:8000/query";
    
    function setUp() public {
        account0 = vm.addr(1);
        
        // Set block timestamp to current time to match DNS signature timestamps
        vm.warp(block.timestamp + 1750780000); // Set to reasonable current time
        
        // Deploy contracts
        ens = new ENSRegistry();
        root = new Root(ens);
        ens.setOwner(bytes32(0), address(root));
        root.setController(account0, true);
        
        // Use trust anchors that match TypeScript tests (including dummy entry with keyTag 1278)
        bytes memory trustAnchors = hex"00002b000100000e1000244a5c080249aac11d7b6f6446702e54a1607371607a1a41855200fd2ce1cdde32f24e8fb500002b000100000e1000244f660802e06d44b80b8f1d39a95c0b0d7c65d08458e880409bbc683457104237c7f8ec8d00002b000100000e10000404fefdfd";
        dnssec = new DNSSECImpl(trustAnchors);
        dnssec.setAlgorithm(253, new DummyAlgorithm());
        dnssec.setDigest(253, new DummyDigest());
        
        resolver = new OffchainDNSResolver(ens, dnssec, GATEWAY);
        
        ownedResolver = new OwnedResolver();
        ownedResolver.transferOwnership(account0);
        
        // Setup mock resolvers
        legacyResolver = new DummyLegacyTextResolver();
        offchainResolver = new TestMockOffchainResolver();
        dummyResolver = new DummyNonCCIPAwareResolver(resolver);
    }
    
    /**
     * Legacy resolver without resolve() support
     * Tests fallback to direct function calls for legacy resolvers
     */
    function testCorrectlyResolvesUsingLegacyResolversWithoutResolveSupport() public {
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create TXT record with legacy resolver address that doesn't support IExtendedDNSResolver
        DNSSEC.RRSetWithSignature[] memory rrsets = _createCustomProof(
            string(abi.encodePacked("ENS1 ", _addressToString(address(legacyResolver))))
        );
        
        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature("text(bytes32,string)", nameHash, "test");
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0)
        );
        
        bytes memory result = resolver.resolveCallback(response, extraData);
        string memory returnedText = abi.decode(result, (string));
        
        // DummyLegacyTextResolver.text() should return "test"
        assertEq(returnedText, "test", "Should return 'test' from legacy resolver");
    }
    
    /**
     * Offchain resolver with nested CCIP-Read
     * Tests proper OffchainLookup error propagation from offchain resolvers
     */
    function testCorrectlyResolvesUsingOffchainResolver() public {
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create TXT record with offchain resolver address
        DNSSEC.RRSetWithSignature[] memory rrsets = _createCustomProof(
            string(abi.encodePacked("ENS1 ", _addressToString(address(offchainResolver))))
        );
        
        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0)
        );
        
        // The TestMockOffchainResolver triggers OffchainLookup, but OffchainDNSResolver 
        // catches and re-throws it with its own address and wrapped extraData
        // Construct the exact expected OffchainLookup error that OffchainDNSResolver throws
        string[] memory expectedUrls = new string[](1);
        expectedUrls[0] = "https://example.com/";
        
        bytes memory dnsName = DynamicDNSFixtures.dnsEncodeName("test.test");
        bytes memory wrappedExtraData = abi.encode(
            dnsName,                                    // DNS encoded name
            query,                                      // original query
            TestMockOffchainResolver.resolveCallback.selector  // inner callback function
        );
        
        vm.expectRevert(
            abi.encodeWithSignature(
                "OffchainLookup(address,string[],bytes,bytes4,bytes)",
                address(resolver),                      // sender = OffchainDNSResolver address
                expectedUrls,                           // urls = ["https://example.com/"]
                query,                                  // callData = query (addr function call)
                OffchainDNSResolver.resolveCallback.selector,  // callbackFunction
                wrappedExtraData                        // extraData = wrapped data
            )
        );
        resolver.resolveCallback(response, extraData);
    }
    
    /**
     * Prevents OffchainLookup propagation from non-CCIP-aware contracts
     * Tests InvalidOperation error for non-CCIP-aware contracts that trigger OffchainLookup
     */
    function testShouldPreventOffchainLookupErrorPropagationFromNonCCIPAwareContracts() public {
        bytes32 nameHash = keccak256(abi.encodePacked(keccak256("test"), keccak256("test")));
        
        // Create TXT record with non-CCIP-aware resolver address
        DNSSEC.RRSetWithSignature[] memory rrsets = _createCustomProof(
            string(abi.encodePacked("ENS1 ", _addressToString(address(dummyResolver))))
        );
        
        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0)
        );
        
        // Should revert with InvalidOperation for non-CCIP-aware contracts
        // This prevents OffchainLookup propagation from untrusted contracts
        vm.expectRevert(abi.encodeWithSignature("InvalidOperation()"));
        resolver.resolveCallback(response, extraData);
    }
    
    /**
     * @dev Create custom DNSSEC proof with specified TXT content
     */
    function _createCustomProof(string memory txtContent) internal returns (DNSSEC.RRSetWithSignature[] memory) {
        // Use the dynamic fixtures but override the TXT content
        Vm vm = Vm(address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D));
        uint256 currentTime = block.timestamp;
        
        string[] memory inputs = new string[](4);
        inputs[0] = "node";
        inputs[1] = "scripts/generate_dns_fixtures.js";
        inputs[2] = vm.toString(currentTime);
        inputs[3] = txtContent; // Pass custom TXT content instead of preset type
        
        bytes memory result = vm.ffi(inputs);
        
        // Parse the comma-separated hex strings
        uint256 commaPos = 0;
        for (uint256 i = 0; i < result.length; i++) {
            if (result[i] == 0x2C) { // comma
                commaPos = i;
                break;
            }
        }
        
        require(commaPos > 0, "Invalid FFI result format");
        
        // Extract root keys and TXT data
        bytes memory rootKeysHex = new bytes(commaPos);
        bytes memory txtHex = new bytes(result.length - commaPos - 1);
        
        for (uint256 i = 0; i < commaPos; i++) {
            rootKeysHex[i] = result[i];
        }
        for (uint256 i = commaPos + 1; i < result.length; i++) {
            txtHex[i - commaPos - 1] = result[i];
        }
        
        // Convert hex strings to bytes
        bytes memory rootKeysData = DynamicDNSFixtures.hexStringToBytes(string(rootKeysHex));
        bytes memory txtData = DynamicDNSFixtures.hexStringToBytes(string(txtHex));
        
        // Create RRSetWithSignature array
        DNSSEC.RRSetWithSignature[] memory rrsets = new DNSSEC.RRSetWithSignature[](2);
        rrsets[0] = DNSSEC.RRSetWithSignature({
            rrset: rootKeysData,
            sig: hex"00"
        });
        rrsets[1] = DNSSEC.RRSetWithSignature({
            rrset: txtData,
            sig: hex"00"
        });
        
        return rrsets;
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