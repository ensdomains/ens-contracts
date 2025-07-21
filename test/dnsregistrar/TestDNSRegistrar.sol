// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/dnsregistrar/DNSRegistrar.sol";
import "../../contracts/dnssec-oracle/DNSSECImpl.sol";
import "../../contracts/dnssec-oracle/algorithms/RSASHA256Algorithm.sol";
import "../../contracts/dnssec-oracle/algorithms/RSASHA1Algorithm.sol";
import "../../contracts/dnssec-oracle/algorithms/P256SHA256Algorithm.sol";
import "../../contracts/dnssec-oracle/algorithms/DummyAlgorithm.sol";
import "../../contracts/dnssec-oracle/digests/SHA256Digest.sol";
import "../../contracts/dnssec-oracle/digests/SHA1Digest.sol";
import "../../contracts/dnssec-oracle/digests/DummyDigest.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/root/Root.sol";
import "../../contracts/resolvers/PublicResolver.sol";
import "../../contracts/wrapper/INameWrapper.sol";
import {ReverseRegistrar} from "../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import "../../contracts/dnsregistrar/PublicSuffixList.sol";
import "./DynamicDNSFixtures.sol";

// Mock resolver interface for testing
interface IResolver {
    function setApprovalForAll(address operator, bool approved) external;
    function addr(bytes32 node) external view returns (address);
}

// Simple mock resolver for testing address setting
contract MockResolver {
    mapping(bytes32 => address) private addresses;

    function setAddr(bytes32 node, address _addr) external {
        addresses[node] = _addr;
    }

    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }
}

/**
 * @title TestPublicSuffixList
 * @dev Simple public suffix list for testing without import conflicts
 */
contract TestPublicSuffixList is PublicSuffixList {
    mapping(bytes => bool) public suffixes;

    function addPublicSuffix(bytes memory suffix) external {
        suffixes[suffix] = true;
    }

    function isPublicSuffix(
        bytes calldata name
    ) external view override returns (bool) {
        return suffixes[name];
    }
}

/**
 * @title TestDNSRegistrar
 * @dev Tests for DNS-to-ENS registration functionality
 */
contract TestDNSRegistrar is Test {
    DNSRegistrar public dnsRegistrar;
    DNSSECImpl public dnssec;
    ENSRegistry public ens;
    Root public root;
    TestPublicSuffixList public suffixList;
    MockResolver public mockResolver;

    // Algorithm and digest implementations
    RSASHA256Algorithm public rsasha256;
    RSASHA1Algorithm public rsasha1;
    P256SHA256Algorithm public p256sha256;
    DummyAlgorithm public dummyAlgorithm;
    SHA256Digest public sha256Digest;
    SHA1Digest public sha1Digest;
    DummyDigest public dummyDigest;

    // Test accounts
    address public ACCOUNT0 = address(0x1);
    address public ACCOUNT1 = address(0x2);
    address public ACCOUNT2 = address(0x3);

    // DNS constants
    bytes32 constant ROOT_NODE = bytes32(0);

    // Trust anchors
    bytes constant TRUST_ANCHORS =
        hex"00002b000100000e1000244a5c080249aac11d7b6f6446702e54a1607371607a1a41855200fd2ce1cdde32f24e8fb500002b000100000e1000244f660802e06d44b80b8f1d39a95c0b0d7c65d08458e880409bbc683457104237c7f8ec8d00002b000100000e10000404fefdfd";

    function setUp() public {
        // Set a reasonable timestamp for tests (January 1, 2024)
        vm.warp(1704067200);
        // Deploy ENS registry
        ens = new ENSRegistry();

        // Deploy Root contract
        root = new Root(ens);
        ens.setOwner(ROOT_NODE, address(root));

        // Deploy DNSSEC oracle with proper trust anchors
        dnssec = new DNSSECImpl(TRUST_ANCHORS);

        // Deploy algorithm implementations
        rsasha256 = new RSASHA256Algorithm();
        rsasha1 = new RSASHA1Algorithm();
        p256sha256 = new P256SHA256Algorithm();
        dummyAlgorithm = new DummyAlgorithm();

        // Deploy digest implementations
        sha256Digest = new SHA256Digest();
        sha1Digest = new SHA1Digest();
        dummyDigest = new DummyDigest();

        // Configure DNSSEC algorithms
        dnssec.setAlgorithm(5, rsasha1);
        dnssec.setAlgorithm(7, rsasha1);
        dnssec.setAlgorithm(8, rsasha256);
        dnssec.setAlgorithm(13, p256sha256);
        dnssec.setAlgorithm(253, dummyAlgorithm);
        dnssec.setAlgorithm(254, dummyAlgorithm);

        // Configure DNSSEC digests
        dnssec.setDigest(1, sha1Digest);
        dnssec.setDigest(2, sha256Digest);
        dnssec.setDigest(253, dummyDigest);

        // Deploy public suffix list
        suffixList = new TestPublicSuffixList();

        // Add public suffixes
        suffixList.addPublicSuffix(DynamicDNSFixtures.dnsEncodeName("test"));
        suffixList.addPublicSuffix(DynamicDNSFixtures.dnsEncodeName("co.nz"));

        // Deploy MockResolver for testing
        mockResolver = new MockResolver();

        // Deploy DNS registrar
        dnsRegistrar = new DNSRegistrar(
            address(0), // previousRegistrar (none)
            address(0), // resolver (none for now)
            dnssec, // DNSSEC oracle
            suffixList, // Public suffix list
            ens // ENS registry
        );

        // Set DNS registrar as controller
        root.setController(address(dnsRegistrar), true);
    }

    function testSetsConstructorVariablesCorrectly() public view {
        assertEq(
            address(dnsRegistrar.oracle()),
            address(dnssec),
            "DNSSEC oracle should be set"
        );
        assertEq(
            address(dnsRegistrar.ens()),
            address(ens),
            "ENS registry should be set"
        );
    }

    function testAllowsAnyoneToClaimOnBehalfOfOwner() public {
        vm.startPrank(ACCOUNT1);

        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof
        );

        vm.stopPrank();

        bytes32 node = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(ROOT_NODE, keccak256("test"))),
                keccak256("foo")
            )
        );
        assertEq(ens.owner(node), ACCOUNT0, "Owner should be ACCOUNT0");
    }

    function testAllowsClaimsOnNonTLDs() public {
        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.co.nz", ACCOUNT0, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.co.nz"),
            proof
        );

        bytes32 nzNode = keccak256(
            abi.encodePacked(ROOT_NODE, keccak256("nz"))
        );
        bytes32 coNode = keccak256(abi.encodePacked(nzNode, keccak256("co")));
        bytes32 fooNode = keccak256(abi.encodePacked(coNode, keccak256("foo")));

        assertEq(ens.owner(fooNode), ACCOUNT0, "Owner should be ACCOUNT0");
    }

    function testAllowsAnyoneToUpdateDNSSECReferencedName() public {
        // First claim
        DNSSEC.RRSetWithSignature[] memory proof1 = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof1
        );

        bytes32 node = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(ROOT_NODE, keccak256("test"))),
                keccak256("foo")
            )
        );
        assertEq(ens.owner(node), ACCOUNT0, "Initial owner should be ACCOUNT0");

        // Update to new owner
        vm.warp(block.timestamp + 60); // Advance time to ensure new proof has later inception

        DNSSEC.RRSetWithSignature[] memory proof2 = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT1, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof2
        );

        assertEq(
            ens.owner(node),
            ACCOUNT1,
            "Owner should be updated to ACCOUNT1"
        );
    }

    function testRejectsProofsWithEarlierInceptions() public {
        // First claim
        DNSSEC.RRSetWithSignature[] memory proof1 = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof1
        );

        // Try to update with stale inception
        DNSSEC.RRSetWithSignature[] memory proof2 = DynamicDNSFixtures
            .createProofForDNSRegistrar(
                "foo.test",
                ACCOUNT1,
                "stale-inception"
            );

        vm.expectRevert(abi.encodeWithSignature("StaleProof()"));
        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof2
        );
    }

    function testDoesNotAllowUpdatesWithStaleRecords() public {
        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "expired-sig");

        vm.expectRevert(
            abi.encodeWithSignature(
                "SignatureExpired(uint32,uint32)",
                block.timestamp - 3600 * 24,
                block.timestamp
            )
        );
        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof
        );
    }

    function testAllowsOwnerToClaimAndSetResolver() public {
        vm.startPrank(ACCOUNT0);

        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "valid");

        dnsRegistrar.proveAndClaimWithResolver(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof,
            ACCOUNT1,
            address(0)
        );

        vm.stopPrank();

        bytes32 node = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(ROOT_NODE, keccak256("test"))),
                keccak256("foo")
            )
        );
        assertEq(ens.owner(node), ACCOUNT0, "Owner should be ACCOUNT0");
        assertEq(ens.resolver(node), ACCOUNT1, "Resolver should be ACCOUNT1");
    }

    function testDoesNotAllowAnyoneElseToClaimAndSetResolver() public {
        vm.startPrank(ACCOUNT0);

        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar(
                "foo.test",
                ACCOUNT1, // Proof is for ACCOUNT1
                "valid"
            );

        vm.expectRevert(
            abi.encodeWithSignature(
                "PermissionDenied(address,address)",
                ACCOUNT0,
                ACCOUNT1
            )
        );
        dnsRegistrar.proveAndClaimWithResolver(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof,
            ACCOUNT1,
            address(0)
        );

        vm.stopPrank();
    }

    function testSetsAddressOnResolverIfProvided() public {
        // Set up reverse domain structure as root owner
        bytes32 reverseLabel = keccak256("reverse");
        bytes32 addrLabel = keccak256("addr");
        bytes32 reverseNode = keccak256(
            abi.encodePacked(ROOT_NODE, reverseLabel)
        );

        vm.startPrank(address(root));
        ens.setSubnodeOwner(ROOT_NODE, reverseLabel, ACCOUNT0);
        vm.stopPrank();

        vm.startPrank(ACCOUNT0);
        // Deploy ReverseRegistrar
        ReverseRegistrar reverseRegistrar = new ReverseRegistrar(ens);
        ens.setSubnodeOwner(reverseNode, addrLabel, address(reverseRegistrar));

        // Deploy PublicResolver with zero addresses
        PublicResolver publicResolver = new PublicResolver(
            ens, // ENSRegistry
            INameWrapper(address(0)), // NameWrapper (zero address)
            address(0), // Trusted ETH controller (zero address)
            address(0) // Reverse registrar (zero address)
        );

        // Grant DNSRegistrar approval to set addresses
        publicResolver.setApprovalForAll(address(dnsRegistrar), true);

        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "valid");

        // Use proveAndClaimWithResolver with PublicResolver
        dnsRegistrar.proveAndClaimWithResolver(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof,
            address(publicResolver),
            ACCOUNT0 // Set the address to ACCOUNT0
        );

        vm.stopPrank();

        // Calculate the node for foo.test
        bytes32 node = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(ROOT_NODE, keccak256("test"))),
                keccak256("foo")
            )
        );

        // Verify address is set on PublicResolver
        assertEq(
            publicResolver.addr(node),
            ACCOUNT0,
            "Address should be set on resolver"
        );
    }

    function testForbidsSettingAddressWithoutResolver() public {
        vm.startPrank(ACCOUNT0);

        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", ACCOUNT0, "valid");

        vm.expectRevert(abi.encodeWithSignature("PreconditionNotMet()"));
        dnsRegistrar.proveAndClaimWithResolver(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof,
            address(0),
            ACCOUNT0
        );

        vm.stopPrank();
    }

    function testDoesNotAllowSettingOwnerToZeroWithEmptyRecord() public {
        DNSSEC.RRSetWithSignature[] memory proof = DynamicDNSFixtures
            .createProofForDNSRegistrar("foo.test", address(0), "empty");

        vm.expectRevert(abi.encodeWithSignature("NoOwnerRecordFound()"));
        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proof
        );
    }

    function testCannotClaimMultipleNamesUsingSingleUnrelatedProof() public {
        // Claim alice.test
        DNSSEC.RRSetWithSignature[] memory proofForAlice = DynamicDNSFixtures
            .createProofForDNSRegistrar("alice.test", ACCOUNT1, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("alice.test"),
            proofForAlice
        );

        bytes32 aliceNode = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(ROOT_NODE, keccak256("test"))),
                keccak256("alice")
            )
        );
        assertEq(
            ens.owner(aliceNode),
            ACCOUNT1,
            "Alice should be owned by ACCOUNT1"
        );

        // Try to claim foo.test with alice's proof
        vm.expectRevert(abi.encodeWithSignature("NoOwnerRecordFound()"));
        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("foo.test"),
            proofForAlice
        );
    }

    function testCannotTakeoverClaimedDomainsUsingUnrelatedProof() public {
        // Alice claims her domain
        DNSSEC.RRSetWithSignature[] memory proofForAlice = DynamicDNSFixtures
            .createProofForDNSRegistrar("alice.test", ACCOUNT1, "valid");

        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("alice.test"),
            proofForAlice
        );

        bytes32 aliceNode = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked(ROOT_NODE, keccak256("test"))),
                keccak256("alice")
            )
        );
        assertEq(
            ens.owner(aliceNode),
            ACCOUNT1,
            "Alice should be owned by ACCOUNT1"
        );

        // Bob's proof
        DNSSEC.RRSetWithSignature[] memory proofForBob = DynamicDNSFixtures
            .createProofForDNSRegistrar("bob.test", ACCOUNT2, "valid");

        // Bob cannot claim alice's domain
        vm.expectRevert(abi.encodeWithSignature("NoOwnerRecordFound()"));
        dnsRegistrar.proveAndClaim(
            DynamicDNSFixtures.dnsEncodeName("alice.test"),
            proofForBob
        );
    }
}
