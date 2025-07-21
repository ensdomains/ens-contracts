// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/OffchainDNSResolver.sol";
import "./DynamicDNSFixtures.sol";
import "../../contracts/dnssec-oracle/DNSSECImpl.sol";
import "../../contracts/dnssec-oracle/algorithms/DummyAlgorithm.sol";
import "../../contracts/dnssec-oracle/digests/DummyDigest.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/resolvers/OwnedResolver.sol";
import "../../contracts/root/Root.sol";
import {DNSSEC} from "../../contracts/dnssec-oracle/DNSSEC.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";

/**
 * @title TestOffchainDNSResolver
 * @dev Tests using OffchainDNSResolver with dynamic DNS wire format
 */
contract TestOffchainDNSResolver is Test {
    OffchainDNSResolver public resolver;
    ENSRegistry public ens;
    OwnedResolver public ownedResolver;
    Root public root;
    DNSSECImpl public dnssec;

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
        bytes
            memory trustAnchors = hex"00002b000100000e1000244a5c080249aac11d7b6f6446702e54a1607371607a1a41855200fd2ce1cdde32f24e8fb500002b000100000e1000244f660802e06d44b80b8f1d39a95c0b0d7c65d08458e880409bbc683457104237c7f8ec8d00002b000100000e10000404fefdfd";
        dnssec = new DNSSECImpl(trustAnchors);
        dnssec.setAlgorithm(253, new DummyAlgorithm());
        dnssec.setDigest(253, new DummyDigest());

        resolver = new OffchainDNSResolver(ens, dnssec, GATEWAY);

        ownedResolver = new OwnedResolver();
        ownedResolver.transferOwnership(account0);
    }

    /**
     * @dev Test OffchainLookup error is thrown on resolve()
     * "should respond to resolution requests with a CCIP read request to the DNS gateway"
     */
    function testResolveTriggersCCIPRead() public {
        bytes memory dnsName = DynamicDNSFixtures.dnsEncodeName("test.test");
        bytes32 nameHash = keccak256(
            abi.encodePacked(keccak256("test"), keccak256("test"))
        );
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);

        // This should trigger OffchainLookup error (CCIP-Read)
        // Constructing expected OffchainLookup error
        string[] memory urls = new string[](1);
        urls[0] = GATEWAY;

        // Expected gateway call data (DNS resolve for test.test TXT records)
        bytes memory expectedData = abi.encodeWithSignature(
            "resolve(bytes,uint16)",
            dnsName,
            uint16(16)
        );

        // Expected extraData for resolveCallback
        bytes memory expectedExtraData = abi.encode(
            dnsName,
            query,
            bytes4(0x00000000)
        );

        vm.expectRevert(
            abi.encodeWithSignature(
                "OffchainLookup(address,string[],bytes,bytes4,bytes)",
                address(resolver),
                urls,
                expectedData,
                bytes4(0xb4a85801), // resolveCallback selector
                expectedExtraData
            )
        );
        resolver.resolve(dnsName, query);
    }

    /**
     * @dev Test successful resolveCallback with valid TXT records
     * "handles calls to resolveCallback() with valid DNS TXT records containing an address"
     */
    function testResolveCallbackWithValidTXTRecords() public {
        address testAddr = 0x1d1499e622D69689cdf9004d05Ec547d650Ff211; // Fixed address from fixtures
        bytes32 nameHash = keccak256(
            abi.encodePacked(keccak256("test"), keccak256("test"))
        );

        // Set up ownedResolver to resolve to the fixed address
        vm.prank(account0);
        ownedResolver.setAddr(nameHash, testAddr);

        // Create proper DNSSEC proof with wire format generated at runtime
        DNSSEC.RRSetWithSignature[] memory rrsets = DynamicDNSFixtures
            .createValidProof("standard");

        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0) // No callback selector
        );

        // This exercises the OffchainDNSResolver.resolveCallback with DNSSEC validation
        bytes memory result = resolver.resolveCallback(response, extraData);
        address returned = abi.decode(result, (address));

        assertEq(
            returned,
            testAddr,
            "Should return correct address through resolver"
        );
    }

    /**
     * @dev Test resolveCallback with extra data
     * "handles calls to resolveCallback() with extra data and a legacy resolver"
     */
    function testResolveCallbackWithExtraData() public {
        address testAddr = 0x1d1499e622D69689cdf9004d05Ec547d650Ff211;
        bytes32 nameHash = keccak256(
            abi.encodePacked(keccak256("test"), keccak256("test"))
        );

        // Set up ownedResolver to resolve to the fixed address
        vm.prank(account0);
        ownedResolver.setAddr(nameHash, testAddr);

        // Create TXT record with extra data using dynamic wire format
        DNSSEC.RRSetWithSignature[] memory rrsets = DynamicDNSFixtures
            .createValidProof("extra");

        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0)
        );

        bytes memory result = resolver.resolveCallback(response, extraData);
        address returned = abi.decode(result, (address));

        assertEq(
            returned,
            testAddr,
            "Should ignore extra data and return correct address"
        );
    }

    /**
     * @dev Test resolveCallback with ENS name resolution
     * "handles calls to resolveCallback() with valid DNS TXT records containing a name"
     */
    function testResolveCallbackWithENSName() public {
        // Setup dnsresolver.eth
        bytes32 ethNode = keccak256(
            abi.encodePacked(bytes32(0), keccak256("eth"))
        );
        bytes32 dnsresolverNode = keccak256(
            abi.encodePacked(ethNode, keccak256("dnsresolver"))
        );

        vm.startPrank(account0);
        root.setSubnodeOwner(keccak256("eth"), account0);
        ens.setSubnodeOwner(ethNode, keccak256("dnsresolver"), account0);
        ens.setResolver(dnsresolverNode, address(ownedResolver));

        address testAddr = 0xfefeFEFeFEFEFEFEFeFefefefefeFEfEfefefEfe;
        bytes32 nameHash = keccak256(
            abi.encodePacked(keccak256("test"), keccak256("test"))
        );

        // Set dnsresolver.eth to point to ownedResolver
        ownedResolver.setAddr(dnsresolverNode, address(ownedResolver));
        ownedResolver.setAddr(nameHash, testAddr);
        vm.stopPrank();

        // Create TXT record with ENS name using dynamic wire format
        DNSSEC.RRSetWithSignature[] memory rrsets = DynamicDNSFixtures
            .createValidProof("ens");

        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature("addr(bytes32)", nameHash);
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0)
        );

        bytes memory result = resolver.resolveCallback(response, extraData);
        address returned = abi.decode(result, (address));

        assertEq(returned, testAddr, "Should resolve through ENS name");
    }

    /**
     * @dev Test resolveCallback rejects invalid TXT records
     * "rejects calls to resolveCallback() with invalid TXT record"
     */
    function testResolveCallbackRejectsInvalidTXT() public {
        // Create invalid TXT record (not ENS1 format) using dynamic wire format
        DNSSEC.RRSetWithSignature[] memory rrsets = DynamicDNSFixtures
            .createValidProof("invalid");

        bytes memory response = abi.encode(rrsets);
        bytes memory query = abi.encodeWithSignature(
            "addr(bytes32)",
            keccak256("test.test")
        );
        bytes memory extraData = abi.encode(
            DynamicDNSFixtures.dnsEncodeName("test.test"),
            query,
            bytes4(0)
        );

        vm.expectRevert(
            abi.encodeWithSignature(
                "CouldNotResolve(bytes)",
                DynamicDNSFixtures.dnsEncodeName("test.test")
            )
        );
        resolver.resolveCallback(response, extraData);
    }

    /**
     * @dev Test supportsInterface
     */
    function testSupportsInterface() public view {
        bool result = resolver.supportsInterface(
            type(IExtendedResolver).interfaceId
        ); // IExtendedResolver interface
        assertTrue(result, "Should support IExtendedResolver interface");
    }
}
