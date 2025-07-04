// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../../contracts/wrapper/INameWrapper.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import "../../../contracts/wrapper/INameWrapperUpgrade.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title SetUpgradeContract
 * @dev SetUpgradeContract functionality tests for NameWrapper
 */
contract SetUpgradeContract is Test {
    
    NameWrapper public nameWrapper;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;
    
    // Test accounts
    address constant OWNER = address(0x1);
    address constant UPGRADE_CONTRACT = address(0x2);
    address constant NEW_UPGRADE_CONTRACT = address(0x3);
    address constant UNAUTHORIZED = address(0x4);
    address constant DUMMY_ADDRESS = address(0x5);
    
    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE = keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    
    // Time constants
    uint256 constant DAY = 86400;
    
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
        
        // Deploy name wrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);
        
        // Set up domain structure
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(OWNER);
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractByOwner() public {
        vm.startPrank(OWNER);
        
        // Initially no approvals should exist
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Registrar should not be approved initially");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Registry should not be approved initially");
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Check approvals are set
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Registrar should be approved for upgrade contract");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Registry should be approved for upgrade contract");
        
        vm.stopPrank();
    }
    
    function testCannotSetUpgradeContractByNonOwner() public {
        vm.startPrank(UNAUTHORIZED);
        
        vm.expectRevert("Ownable: caller is not the owner");
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractRevokesOldApprovals() public {
        vm.startPrank(OWNER);
        
        // Set initial upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Check initial approvals
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Initial contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Initial contract should be approved");
        
        // Set new upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(NEW_UPGRADE_CONTRACT));
        
        // Check old approvals are revoked
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Old contract should not be approved");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Old contract should not be approved");
        
        // Check new approvals are set
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), NEW_UPGRADE_CONTRACT), "New contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), NEW_UPGRADE_CONTRACT), "New contract should be approved");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractToZeroAddress() public {
        vm.startPrank(OWNER);
        
        // Set initial upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Check initial approvals
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Contract should be approved initially");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Contract should be approved initially");
        
        // Set upgrade contract to zero address
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(0)));
        
        // Check old approvals are revoked
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Old contract should not be approved");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Old contract should not be approved");
        
        // Check zero address is not approved (it shouldn't be)
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractMultipleTimes() public {
        vm.startPrank(OWNER);
        
        // Set first upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "First contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "First contract should be approved");
        
        // Set second upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(NEW_UPGRADE_CONTRACT));
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "First contract should not be approved");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "First contract should not be approved");
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), NEW_UPGRADE_CONTRACT), "Second contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), NEW_UPGRADE_CONTRACT), "Second contract should be approved");
        
        // Set third upgrade contract (dummy address)
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(DUMMY_ADDRESS));
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), NEW_UPGRADE_CONTRACT), "Second contract should not be approved");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), NEW_UPGRADE_CONTRACT), "Second contract should not be approved");
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), DUMMY_ADDRESS), "Third contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), DUMMY_ADDRESS), "Third contract should be approved");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractSameAddress() public {
        vm.startPrank(OWNER);
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Contract should be approved");
        
        // Set same upgrade contract again
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Should still be approved
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Contract should still be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Contract should still be approved");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractWithActiveNames() public {
        vm.startPrank(OWNER);
        
        // Register and wrap a domain first
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        string memory testLabel = "upgrade";
        bytes32 testLabelHash = keccak256(bytes(testLabel));
        uint256 testLabelId = uint256(testLabelHash);
        
        baseRegistrar.register(testLabelId, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(testLabel, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Check approvals are set correctly
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Registrar should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Registry should be approved");
        
        // Domain should still be wrapped and owned correctly
        bytes32 testNode = keccak256(abi.encodePacked(ETH_NODE, testLabelHash));
        uint256 testNodeId = uint256(testNode);
        assertTrue(nameWrapper.isWrapped(testNode), "Domain should still be wrapped");
        assertEq(nameWrapper.ownerOf(testNodeId), OWNER, "Domain should still be owned");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractEffectOnExistingApprovals() public {
        vm.startPrank(OWNER);
        
        // Set some other approvals first (OWNER approves DUMMY_ADDRESS)
        ens.setApprovalForAll(DUMMY_ADDRESS, true);
        baseRegistrar.setApprovalForAll(DUMMY_ADDRESS, true);
        
        // Verify other approvals exist (OWNER has approved DUMMY_ADDRESS)
        assertTrue(ens.isApprovedForAll(OWNER, DUMMY_ADDRESS), "Other approvals should exist");
        assertTrue(baseRegistrar.isApprovedForAll(OWNER, DUMMY_ADDRESS), "Other approvals should exist");
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Check upgrade contract approvals are set
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Upgrade contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Upgrade contract should be approved");
        
        // Check other approvals are unaffected (OWNER's approvals should remain)
        assertTrue(ens.isApprovedForAll(OWNER, DUMMY_ADDRESS), "Other approvals should be unaffected");
        assertTrue(baseRegistrar.isApprovedForAll(OWNER, DUMMY_ADDRESS), "Other approvals should be unaffected");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractZeroAddressDoesNotSetApproval() public {
        vm.startPrank(OWNER);
        
        // Verify zero address is not approved initially
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved initially");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved initially");
        
        // Set upgrade contract to zero address
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(0)));
        
        // Verify zero address is still not approved
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved after setting");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved after setting");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractFromZeroAddress() public {
        vm.startPrank(OWNER);
        
        // Initially set to zero address (default state)
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(0)));
        
        // Verify no approvals exist
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), address(0)), "Zero address should not be approved");
        assertFalse(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Upgrade contract should not be approved yet");
        assertFalse(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Upgrade contract should not be approved yet");
        
        // Set actual upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT));
        
        // Check new approvals are set
        assertTrue(baseRegistrar.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Upgrade contract should be approved");
        assertTrue(ens.isApprovedForAll(address(nameWrapper), UPGRADE_CONTRACT), "Upgrade contract should be approved");
        
        vm.stopPrank();
    }
    
    function testSetUpgradeContractPermissions() public {
        // Test that only owner can call
        vm.startPrank(OWNER);
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(UPGRADE_CONTRACT)); // Should work
        vm.stopPrank();
        
        // Test that non-owner cannot call
        address[] memory nonOwners = new address[](3);
        nonOwners[0] = UPGRADE_CONTRACT;
        nonOwners[1] = UNAUTHORIZED;
        nonOwners[2] = address(0x999);
        
        for (uint i = 0; i < nonOwners.length; i++) {
            vm.startPrank(nonOwners[i]);
            vm.expectRevert("Ownable: caller is not the owner");
            nameWrapper.setUpgradeContract(INameWrapperUpgrade(NEW_UPGRADE_CONTRACT));
            vm.stopPrank();
        }
    }
}

