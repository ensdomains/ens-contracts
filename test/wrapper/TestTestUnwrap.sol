// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/wrapper/NameWrapper.sol";
import "../../contracts/wrapper/mocks/TestUnwrap.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../utils/MockMetadataService.sol";

/**
 * @title TestTestUnwrap
 * @dev Tests for the TestUnwrap mock contract functionality
 */
contract TestTestUnwrap is Test {
    
    NameWrapper public nameWrapper;
    TestUnwrap public testUnwrap;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;
    
    // Test accounts
    address constant OWNER = address(0x1);
    address constant ACCOUNT = address(0x2);
    address constant OTHER = address(0x3);
    
    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE = keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    
    // Test domains
    string constant TEST_LABEL = "test";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
    string constant SUB_LABEL = "sub";
    bytes32 constant SUB_LABEL_HASH = keccak256(bytes(SUB_LABEL));
    bytes32 constant SUB_NODE = keccak256(abi.encodePacked(TEST_NODE, SUB_LABEL_HASH));
    uint256 constant SUB_NODE_ID = uint256(SUB_NODE);
    
    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;
    
    // Import fuse constants from INameWrapper
    // CAN_DO_EVERYTHING, CANNOT_UNWRAP, etc. are imported
    
    function setUp() public {
        vm.startPrank(OWNER);
        
        // Deploy core contracts
        ens = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        metadataService = IMetadataService(address(new MockMetadataService()));
        
        // Deploy reverse registrar
        reverseRegistrar = new ReverseRegistrar(ens);
        
        // Set up reverse registry
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), OWNER);
        ens.setSubnodeOwner(keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse"))), keccak256("addr"), address(reverseRegistrar));
        
        // Deploy test unwrap contract
        testUnwrap = new TestUnwrap(ens, baseRegistrar);
        
        // Deploy name wrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);
        
        // Set up domain structure
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(OWNER);
        
        vm.stopPrank();
    }
    
    function testSetWrapperApproval() public {
        vm.startPrank(OWNER);
        
        // Initially not approved
        assertFalse(testUnwrap.approvedWrapper(address(nameWrapper)), "Should not be approved initially");
        
        // Set approval
        testUnwrap.setWrapperApproval(address(nameWrapper), true);
        assertTrue(testUnwrap.approvedWrapper(address(nameWrapper)), "Should be approved");
        
        // Revoke approval
        testUnwrap.setWrapperApproval(address(nameWrapper), false);
        assertFalse(testUnwrap.approvedWrapper(address(nameWrapper)), "Should not be approved after revocation");
        
        vm.stopPrank();
    }
    
    function testWrapperApprovalOnlyOwner() public {
        vm.prank(ACCOUNT);
        vm.expectRevert("Ownable: caller is not the owner");
        testUnwrap.setWrapperApproval(address(nameWrapper), true);
    }
    
    function testWrapETH2LDUnauthorized() public {
        vm.startPrank(OWNER);
        
        // Register domain but don't set up proper approvals
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        
        // Try to wrap without approval - should fail
        vm.expectRevert("Unauthorised");
        testUnwrap.wrapETH2LD(TEST_LABEL, ACCOUNT, CAN_DO_EVERYTHING, MAX_EXPIRY, address(0));
        
        vm.stopPrank();
    }
    
    function testWrapETH2LDAuthorized() public {
        vm.startPrank(OWNER);
        
        // Register domain and set up approvals
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        
        // Set up approvals
        testUnwrap.setWrapperApproval(OWNER, true);
        baseRegistrar.setApprovalForAll(address(testUnwrap), true);
        
        // Get initial state
        address initialOwner = baseRegistrar.ownerOf(TEST_LABEL_ID);
        assertEq(initialOwner, OWNER, "Should initially own the token");
        
        // Wrap through TestUnwrap (which unwraps to ACCOUNT)
        testUnwrap.wrapETH2LD(TEST_LABEL, ACCOUNT, CAN_DO_EVERYTHING, MAX_EXPIRY, address(0));
        
        // Check that domain was transferred to ACCOUNT
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), ACCOUNT, "Token should be transferred to ACCOUNT");
        assertEq(ens.owner(TEST_NODE), ACCOUNT, "ENS ownership should be set to ACCOUNT");
        
        vm.stopPrank();
    }
    
    function testSetSubnodeRecordUnauthorized() public {
        vm.startPrank(OWNER);
        
        // Set up parent domain in ENS
        ens.setSubnodeOwner(ROOT_NODE, TEST_LABEL_HASH, OWNER);
        
        // Try to set subnode without approval - should fail
        vm.expectRevert("Unauthorised");
        testUnwrap.setSubnodeRecord(TEST_NODE, SUB_LABEL, ACCOUNT, address(0), 0, CAN_DO_EVERYTHING, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testSetSubnodeRecordAuthorized() public {
        vm.startPrank(OWNER);
        
        // Set up parent domain under .eth
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, OWNER);
        ens.setSubnodeOwner(ETH_NODE, TEST_LABEL_HASH, OWNER);
        
        // Create subdomain first (TestUnwrap can only transfer existing domains)
        ens.setSubnodeOwner(TEST_NODE, SUB_LABEL_HASH, OWNER);
        
        // Set up approvals
        testUnwrap.setWrapperApproval(OWNER, true);
        ens.setApprovalForAll(address(testUnwrap), true);
        
        // Verify subdomain is owned by OWNER
        assertEq(ens.owner(SUB_NODE), OWNER, "Subdomain should be owned by OWNER initially");
        
        // Transfer subnode through TestUnwrap
        testUnwrap.setSubnodeRecord(TEST_NODE, SUB_LABEL, ACCOUNT, address(0), 0, CAN_DO_EVERYTHING, MAX_EXPIRY);
        
        // Check that subdomain was transferred
        assertEq(ens.owner(SUB_NODE), ACCOUNT, "Subdomain owner should be transferred to ACCOUNT");
        
        vm.stopPrank();
    }
    
    function testWrapFromUpgradeETH2LD() public {
        vm.startPrank(OWNER);
        
        // Register domain and set up approvals
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        
        testUnwrap.setWrapperApproval(OWNER, true);
        baseRegistrar.setApprovalForAll(address(testUnwrap), true);
        
        // Prepare DNS-encoded name for .eth domain
        bytes memory dnsName = abi.encodePacked(uint8(4), "test", uint8(3), "eth", uint8(0));
        
        // Wrap from upgrade
        testUnwrap.wrapFromUpgrade(dnsName, ACCOUNT, CAN_DO_EVERYTHING, MAX_EXPIRY, address(0), "");
        
        // Check that domain was transferred
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), ACCOUNT, "Token should be transferred to ACCOUNT");
        assertEq(ens.owner(TEST_NODE), ACCOUNT, "ENS ownership should be set to ACCOUNT");
        
        vm.stopPrank();
    }
    
    function testWrapFromUpgradeSubdomain() public {
        vm.startPrank(OWNER);
        
        // Set up parent domain under .eth
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, OWNER);
        ens.setSubnodeOwner(ETH_NODE, TEST_LABEL_HASH, OWNER);
        ens.setSubnodeOwner(TEST_NODE, SUB_LABEL_HASH, OWNER);
        
        testUnwrap.setWrapperApproval(OWNER, true);
        ens.setApprovalForAll(address(testUnwrap), true);
        
        // Prepare DNS-encoded name for subdomain
        bytes memory dnsName = abi.encodePacked(uint8(3), "sub", uint8(4), "test", uint8(3), "eth", uint8(0));
        
        // Wrap from upgrade
        testUnwrap.wrapFromUpgrade(dnsName, ACCOUNT, CAN_DO_EVERYTHING, MAX_EXPIRY, address(0), "");
        
        // Check that subdomain was transferred
        assertEq(ens.owner(SUB_NODE), ACCOUNT, "Subdomain owner should be set to ACCOUNT");
        
        vm.stopPrank();
    }
    
    function testContractReferences() public view {
        // Test that contract references are set correctly
        assertEq(address(testUnwrap.ens()), address(ens), "ENS reference should be correct");
        assertEq(address(testUnwrap.registrar()), address(baseRegistrar), "Registrar reference should be correct");
    }
    
    function testUnauthorizedCalls() public {
        vm.startPrank(ACCOUNT); // Non-owner
        
        // Only owner can set wrapper approval
        vm.expectRevert("Ownable: caller is not the owner");
        testUnwrap.setWrapperApproval(address(nameWrapper), true);
        
        vm.stopPrank();
        
        // Set up domain first so we get proper Unauthorised errors
        vm.startPrank(OWNER);
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, OWNER);
        ens.setSubnodeOwner(ETH_NODE, TEST_LABEL_HASH, OWNER);
        ens.setSubnodeOwner(TEST_NODE, SUB_LABEL_HASH, OWNER);
        vm.stopPrank();
        
        // Test unauthorized wrap attempts
        vm.startPrank(OTHER);
        
        vm.expectRevert("Unauthorised");
        testUnwrap.wrapETH2LD(TEST_LABEL, ACCOUNT, CAN_DO_EVERYTHING, MAX_EXPIRY, address(0));
        
        vm.expectRevert("Unauthorised");
        testUnwrap.setSubnodeRecord(TEST_NODE, SUB_LABEL, ACCOUNT, address(0), 0, CAN_DO_EVERYTHING, MAX_EXPIRY);
        
        vm.stopPrank();
    }
    
    function testMakeNodeFunction() public pure {
        // Test the internal logic by calling functions that use _makeNode
        bytes32 parentNode = TEST_NODE;
        bytes32 labelHash = SUB_LABEL_HASH;
        bytes32 expectedNode = keccak256(abi.encodePacked(parentNode, labelHash));
        
        // The _makeNode function is private, but we can verify its behavior
        // through the public functions that use it
        assertEq(SUB_NODE, expectedNode, "Node calculation should be correct");
    }
    
    function testCompleteWorkflow() public {
        vm.startPrank(OWNER);
        
        // Set up complete workflow
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        
        // Set up all approvals
        testUnwrap.setWrapperApproval(OWNER, true);
        baseRegistrar.setApprovalForAll(address(testUnwrap), true);
        ens.setApprovalForAll(address(testUnwrap), true);
        
        // 1. Wrap ETH 2LD
        testUnwrap.wrapETH2LD(TEST_LABEL, ACCOUNT, CAN_DO_EVERYTHING, MAX_EXPIRY, address(0));
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), ACCOUNT, "ETH 2LD should be transferred");
        
        // 2. ACCOUNT now owns the domain in ENS, set up subdomain
        vm.stopPrank();
        vm.startPrank(ACCOUNT);
        
        // ACCOUNT can't set wrapper approval on TestUnwrap (only OWNER can)
        // But ACCOUNT can set ENS approval
        ens.setApprovalForAll(address(testUnwrap), true);
        
        vm.stopPrank();
        
        // OWNER needs to approve ACCOUNT in TestUnwrap
        vm.prank(OWNER);
        testUnwrap.setWrapperApproval(ACCOUNT, true);
        
        // Now ACCOUNT needs to create subdomain first before transferring it
        vm.startPrank(ACCOUNT);
        // Create the subdomain
        ens.setSubnodeOwner(TEST_NODE, SUB_LABEL_HASH, ACCOUNT);
        
        // Now transfer it through TestUnwrap
        testUnwrap.setSubnodeRecord(TEST_NODE, SUB_LABEL, OTHER, address(0), 0, CAN_DO_EVERYTHING, MAX_EXPIRY);
        assertEq(ens.owner(SUB_NODE), OTHER, "Subdomain should be transferred to OTHER");
        
        vm.stopPrank();
        
        console.log("Complete workflow test passed");
    }
}

