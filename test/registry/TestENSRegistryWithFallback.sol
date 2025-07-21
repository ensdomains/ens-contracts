// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/registry/ENSRegistryWithFallback.sol";

/**
 * @title TestENSRegistryWithFallback
 * @dev Tests for ENSRegistryWithFallback with fallback functionality
 */
contract TestENSRegistryWithFallback is BaseTest {
    ENSRegistry public oldEnsRegistry;
    ENSRegistryWithFallback public ensRegistry;

    function setUp() public override {
        super.setUp();

        // Deploy old registry and new registry with fallback
        oldEnsRegistry = new ENSRegistry();
        ensRegistry = new ENSRegistryWithFallback(oldEnsRegistry);
    }

    function testSetRecord() public {
        // Should allow setting the record
        vm.expectEmit(true, true, false, true);
        emit Transfer(ZERO_HASH, USER1);
        vm.expectEmit(true, true, false, true);
        emit NewResolver(ZERO_HASH, USER2);
        vm.expectEmit(true, false, false, true);
        emit NewTTL(ZERO_HASH, 3600);

        ensRegistry.setRecord(ZERO_HASH, USER1, USER2, 3600);

        assertEq(ensRegistry.owner(ZERO_HASH), USER1, "Owner should be set");
        assertEq(
            ensRegistry.resolver(ZERO_HASH),
            USER2,
            "Resolver should be set"
        );
        assertEq(ensRegistry.ttl(ZERO_HASH), 3600, "TTL should be set");
    }

    function testSetSubnodeRecord() public {
        // Should allow setting subnode records
        bytes32 testLabel = labelhash("test");
        bytes32 testNode = namehash("test");

        vm.expectEmit(true, true, true, true);
        emit NewOwner(ZERO_HASH, testLabel, USER1);
        vm.expectEmit(true, true, false, true);
        emit NewResolver(testNode, USER2);
        vm.expectEmit(true, false, false, true);
        emit NewTTL(testNode, 3600);

        ensRegistry.setSubnodeRecord(ZERO_HASH, testLabel, USER1, USER2, 3600);

        assertEq(
            ensRegistry.owner(testNode),
            USER1,
            "Subnode owner should be set"
        );
        assertEq(
            ensRegistry.resolver(testNode),
            USER2,
            "Subnode resolver should be set"
        );
        assertEq(ensRegistry.ttl(testNode), 3600, "Subnode TTL should be set");
    }

    function testApprovalForAll() public {
        // Should implement authorisations/operators
        ensRegistry.setApprovalForAll(USER1, true);

        vm.prank(USER1);
        ensRegistry.setOwner(ZERO_HASH, USER2);

        assertEq(
            ensRegistry.owner(ZERO_HASH),
            USER2,
            "Approved operator should be able to set owner"
        );
    }

    function testFallbackTTL() public {
        // Should use fallback ttl if owner is not set
        bytes32 ethNode = namehash("eth");

        // Set up in old registry
        oldEnsRegistry.setSubnodeOwner(ZERO_HASH, labelhash("eth"), USER1);
        vm.prank(USER1);
        oldEnsRegistry.setTTL(ethNode, 3600);

        // Should read from fallback
        assertEq(ensRegistry.ttl(ethNode), 3600, "Should use fallback TTL");
    }

    function testFallbackOwner() public {
        // Should use fallback owner if owner not set
        bytes32 ethNode = namehash("eth");

        // Set up in old registry
        oldEnsRegistry.setSubnodeOwner(ZERO_HASH, labelhash("eth"), USER1);

        // Should read from fallback
        assertEq(
            ensRegistry.owner(ethNode),
            USER1,
            "Should use fallback owner"
        );
    }

    function testFallbackResolver() public {
        // Should use fallback resolver if owner not set
        bytes32 ethNode = namehash("eth");

        // Set up in old registry
        oldEnsRegistry.setSubnodeOwner(ZERO_HASH, labelhash("eth"), USER1);
        vm.prank(USER1);
        oldEnsRegistry.setResolver(ethNode, USER2);

        // Should read from fallback
        assertEq(
            ensRegistry.resolver(ethNode),
            USER2,
            "Should use fallback resolver"
        );
    }

    // Events from ENSRegistry
    event Transfer(bytes32 indexed node, address owner);
    event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner);
    event NewResolver(bytes32 indexed node, address resolver);
    event NewTTL(bytes32 indexed node, uint64 ttl);
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );
}
