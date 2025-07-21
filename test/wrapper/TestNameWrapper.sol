// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./BaseWrapperTest.sol";
import "../../contracts/wrapper/StaticMetadataService.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title TestNameWrapper
 * @dev Comprehensive core NameWrapper functionality tests
 */
contract TestNameWrapper is BaseWrapperTest {
    // Test-specific domain constants
    string constant SUB_LABEL = "sub";
    bytes32 constant SUB_LABEL_HASH = keccak256(bytes(SUB_LABEL));
    bytes32 SUB_NODE;
    uint256 SUB_NODE_ID;

    function setUp() public override {
        // Call parent setup which uses StaticMetadataService
        super.setUp();

        // Set up test-specific subdomain constants
        SUB_NODE = keccak256(abi.encodePacked(defaultNode, SUB_LABEL_HASH));
        SUB_NODE_ID = uint256(SUB_NODE);
    }

    function testSupportsInterface() public view {
        // Test interface support
        assertTrue(
            nameWrapper.supportsInterface(type(IERC165).interfaceId),
            "Should support IERC165"
        );
        assertTrue(
            nameWrapper.supportsInterface(type(IERC1155).interfaceId),
            "Should support IERC1155"
        );
        assertTrue(
            nameWrapper.supportsInterface(
                type(IERC1155MetadataURI).interfaceId
            ),
            "Should support IERC1155MetadataURI"
        );
        assertTrue(
            nameWrapper.supportsInterface(type(IERC721Receiver).interfaceId),
            "Should support IERC721Receiver"
        );
    }

    function testWrapETH2LD() public {
        vm.startPrank(OWNER);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Test wrapping
        uint64 expiry = nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Check state
        assertEq(
            nameWrapper.ownerOf(defaultNodeId),
            OWNER,
            "Owner should be set"
        );
        assertTrue(
            nameWrapper.isWrapped(defaultNode),
            "Domain should be wrapped"
        );
        assertTrue(expiry > block.timestamp, "Should return future expiry");

        vm.stopPrank();
    }

    function testUnwrapETH2LD() public {
        vm.startPrank(OWNER);

        // Wrap domain first
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Test unwrapping
        nameWrapper.unwrapETH2LD(defaultLabelHash, OWNER, OWNER);

        // Check state
        assertFalse(
            nameWrapper.isWrapped(defaultNode),
            "Domain should not be wrapped"
        );
        assertEq(
            baseRegistrar.ownerOf(defaultLabelId),
            OWNER,
            "Should own base registrar token"
        );

        vm.stopPrank();
    }

    function testSetSubnodeOwner() public {
        vm.startPrank(OWNER);

        // Wrap parent domain first
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Create subdomain
        bytes32 subNode = nameWrapper.setSubnodeOwner(
            defaultNode,
            SUB_LABEL,
            ACCOUNT,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );

        assertEq(subNode, SUB_NODE, "Should return correct subnode");
        assertEq(
            nameWrapper.ownerOf(SUB_NODE_ID),
            ACCOUNT,
            "Subdomain owner should be set"
        );
        assertTrue(
            nameWrapper.isWrapped(SUB_NODE),
            "Subdomain should be wrapped"
        );

        vm.stopPrank();
    }

    function testSetFuses() public {
        vm.startPrank(OWNER);

        // Wrap domain with CANNOT_UNWRAP to enable other fuses
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        // Set additional fuses
        uint32 newFuses = nameWrapper.setFuses(
            defaultNode,
            uint16(CANNOT_TRANSFER)
        );

        // Check fuses were set
        (, uint32 fuses, ) = nameWrapper.getData(defaultNodeId);
        assertTrue(
            fuses & CANNOT_TRANSFER != 0,
            "CANNOT_TRANSFER should be set"
        );
        assertTrue(
            newFuses & CANNOT_UNWRAP != 0,
            "Should include CANNOT_UNWRAP fuse"
        );
        assertTrue(
            newFuses & IS_DOT_ETH != 0,
            "Should include IS_DOT_ETH fuse"
        );

        vm.stopPrank();
    }

    function testGetData() public {
        vm.startPrank(OWNER);

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        // Get data
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(
            defaultNodeId
        );

        assertEq(owner, OWNER, "Owner should match");
        assertTrue(
            fuses & CANNOT_UNWRAP != 0,
            "Should have CANNOT_UNWRAP fuse"
        );
        assertTrue(fuses & IS_DOT_ETH != 0, "Should have IS_DOT_ETH fuse");
        assertTrue(expiry > block.timestamp, "Expiry should be in future");

        vm.stopPrank();
    }

    function testIsWrapped() public {
        vm.startPrank(OWNER);

        // Initially not wrapped
        assertFalse(
            nameWrapper.isWrapped(defaultNode),
            "Should not be wrapped initially"
        );

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Should be wrapped
        assertTrue(
            nameWrapper.isWrapped(defaultNode),
            "Should be wrapped after wrapping"
        );

        // Test the overloaded isWrapped function with parentNode and labelhash
        // Both functions should return the same result
        assertTrue(
            nameWrapper.isWrapped(ETH_NODE, defaultLabelHash),
            "Should be wrapped using labelhash version"
        );

        // Verify both overloads return the same result
        assertEq(
            nameWrapper.isWrapped(defaultNode),
            nameWrapper.isWrapped(ETH_NODE, defaultLabelHash),
            "Both isWrapped overloads should return the same result"
        );

        vm.stopPrank();
    }

    function testSetResolver() public {
        vm.startPrank(OWNER);

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Set resolver
        address newResolver = address(0x123);
        nameWrapper.setResolver(defaultNode, newResolver);

        // Check resolver was set
        assertEq(
            ens.resolver(defaultNode),
            newResolver,
            "Resolver should be set"
        );

        vm.stopPrank();
    }

    function testSetTTL() public {
        vm.startPrank(OWNER);

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Set TTL
        uint64 newTTL = 3600;
        nameWrapper.setTTL(defaultNode, newTTL);

        // Check TTL was set
        assertEq(ens.ttl(defaultNode), newTTL, "TTL should be set");

        vm.stopPrank();
    }

    function testSetRecord() public {
        vm.startPrank(OWNER);

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Set record
        address newOwner = ACCOUNT;
        address newResolver = address(0x123);
        uint64 newTTL = 3600;

        nameWrapper.setRecord(defaultNode, newOwner, newResolver, newTTL);

        // Check record was set
        assertEq(
            nameWrapper.ownerOf(defaultNodeId),
            newOwner,
            "Owner should be set"
        );
        assertEq(
            ens.resolver(defaultNode),
            newResolver,
            "Resolver should be set"
        );
        assertEq(ens.ttl(defaultNode), newTTL, "TTL should be set");

        vm.stopPrank();
    }

    function testApprove() public {
        vm.startPrank(OWNER);

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Approve
        nameWrapper.approve(APPROVED, defaultNodeId);

        // Check approval
        assertEq(
            nameWrapper.getApproved(defaultNodeId),
            APPROVED,
            "Should be approved"
        );

        vm.stopPrank();
    }

    function testERC1155Integration() public {
        vm.startPrank(OWNER);

        // Wrap domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(defaultLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            defaultLabel,
            OWNER,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        // Test ERC1155 functions
        assertEq(
            nameWrapper.balanceOf(OWNER, defaultNodeId),
            1,
            "Should have balance of 1"
        );
        assertEq(
            nameWrapper.balanceOf(ACCOUNT, defaultNodeId),
            0,
            "Should have balance of 0"
        );

        // Test batch balance
        address[] memory accounts = new address[](2);
        accounts[0] = OWNER;
        accounts[1] = ACCOUNT;

        uint256[] memory ids = new uint256[](2);
        ids[0] = defaultNodeId;
        ids[1] = defaultNodeId;

        uint256[] memory balances = nameWrapper.balanceOfBatch(accounts, ids);
        assertEq(balances[0], 1, "First balance should be 1");
        assertEq(balances[1], 0, "Second balance should be 0");

        vm.stopPrank();
    }

    function testMetadataService() public view {
        // Test URI functionality - should return static "https://ens.domains"
        string memory uri = nameWrapper.uri(defaultNodeId);
        assertEq(
            uri,
            "https://ens.domains",
            "URI should return the static ENS domains URL"
        );

        // Test with different token ID - should return same URL (static)
        string memory uri2 = nameWrapper.uri(123);
        assertEq(
            uri2,
            "https://ens.domains",
            "URI should return same static URL for any token ID"
        );
    }
}
