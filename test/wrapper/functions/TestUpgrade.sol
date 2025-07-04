// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseWrapperTest.sol";
import "../../../contracts/wrapper/INameWrapperUpgrade.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title Upgrade
 * @dev Upgrade functionality tests for NameWrapper
 */
contract Upgrade is BaseWrapperTest {
    
    // Note: BaseWrapperTest provides: nameWrapper, ens, baseRegistrar, metadataService, reverseRegistrar
    // and standard accounts: OWNER, ACCOUNT, ACCOUNT2, OTHER, APPROVED
    MockUpgradeContract public upgradeContract;
    
    // Additional test accounts
    address constant NEW_OWNER = address(0x6);
    address constant RESOLVER = address(0x7);
    address constant OPERATOR = address(0x8);
    address constant UNAUTHORIZED = address(0x9);
    
    // Test domains
    string constant TEST_LABEL = "wrapped2";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
    string constant CHILD_LABEL = "sub";
    bytes32 constant CHILD_LABEL_HASH = keccak256(bytes(CHILD_LABEL));
    bytes32 constant CHILD_NODE = keccak256(abi.encodePacked(TEST_NODE, CHILD_LABEL_HASH));
    uint256 constant CHILD_NODE_ID = uint256(CHILD_NODE);
    
    
    function setUp() public override {
        // Call parent setup - but need to override metadataService to use MockMetadataService
        vm.startPrank(OWNER);
        
        // Deploy core contracts with MockMetadataService for upgrade tests
        ens = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        metadataService = IMetadataService(address(new MockMetadataService()));
        
        // Deploy reverse registrar and set up reverse registry FIRST
        reverseRegistrar = new ReverseRegistrar(ens);
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), OWNER);
        ens.setSubnodeOwner(
            keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse"))), 
            keccak256("addr"), 
            address(reverseRegistrar)
        );
        
        // Deploy NameWrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);
        
        // Configure permissions
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(OWNER);
        
        // Set up default domain constants
        defaultLabel = "test";
        _setupDefaultDomain();
        
        // Deploy mock upgrade contract - specific to upgrade tests
        upgradeContract = new MockUpgradeContract();
        
        vm.stopPrank();
    }
    
    function _wrapETH2LD() internal {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CAN_DO_EVERYTHING), address(0));
        
        vm.stopPrank();
    }
    
    function _getDNSEncodedName(string memory name) internal pure returns (bytes memory) {
        bytes memory nameBytes = bytes(name);
        bytes memory encoded = new bytes(nameBytes.length + 2);
        encoded[0] = bytes1(uint8(nameBytes.length));
        for (uint i = 0; i < nameBytes.length; i++) {
            encoded[i + 1] = nameBytes[i];
        }
        encoded[nameBytes.length + 1] = 0x00;
        return encoded;
    }
    
    function testUpgradeETH2LDByOwner() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        // Verify domain is wrapped
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Domain should be wrapped");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), OWNER, "Should be owned by OWNER");
        
        // Get expected values for upgrade
        (, uint32 fuses, uint64 expiry) = nameWrapper.getData(TEST_NODE_ID);
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        
        // Upgrade domain
        nameWrapper.upgrade(dnsName, "");
        
        // Check domain is no longer owned in wrapper
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), address(0), "Should not be owned after upgrade");
        
        // Check upgrade contract was called with correct parameters
        assertEq(upgradeContract.lastUpgradedName(), string(dnsName), "DNS name should match");
        assertEq(upgradeContract.lastUpgradedOwner(), OWNER, "Owner should match");
        assertEq(upgradeContract.lastUpgradedFuses(), fuses, "Fuses should match");
        assertEq(upgradeContract.lastUpgradedExpiry(), expiry, "Expiry should match");
        assertEq(upgradeContract.lastUpgradedApproved(), address(0), "Approved should be zero");
        assertEq(upgradeContract.lastUpgradedExtraData(), "", "Extra data should be empty");
        
        vm.stopPrank();
    }
    
    function testUpgradeByOperator() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        nameWrapper.setApprovalForAll(OPERATOR, true);
        vm.stopPrank();
        
        vm.startPrank(OPERATOR);
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        
        // Upgrade as operator
        nameWrapper.upgrade(dnsName, "");
        
        // Check upgrade succeeded
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), address(0), "Should not be owned after upgrade");
        assertEq(upgradeContract.lastUpgradedOwner(), OWNER, "Original owner should be passed");
        
        vm.stopPrank();
    }
    
    function testCannotUpgradeByUnauthorized() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        vm.stopPrank();
        
        vm.startPrank(UNAUTHORIZED);
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, UNAUTHORIZED));
        nameWrapper.upgrade(dnsName, "");
        
        vm.stopPrank();
    }
    
    function testCannotUpgradeWithoutUpgradeContract() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        vm.expectRevert(abi.encodeWithSignature("CannotUpgrade()"));
        nameWrapper.upgrade(dnsName, "");
        
        vm.stopPrank();
    }
    
    function testCannotUpgradeAfterUpgradeContractSetToZero() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        // Set upgrade contract to zero
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(0)));
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        vm.expectRevert(abi.encodeWithSignature("CannotUpgrade()"));
        nameWrapper.upgrade(dnsName, "");
        
        vm.stopPrank();
    }
    
    function testUpgradeWithFuses() public {
        vm.startPrank(OWNER);
        
        // Register and wrap with fuses
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP | CANNOT_SET_RESOLVER), address(0));
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        // Get fuses before upgrade
        (, uint32 expectedFuses,) = nameWrapper.getData(TEST_NODE_ID);
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        nameWrapper.upgrade(dnsName, "");
        
        // Check fuses were passed correctly
        assertEq(upgradeContract.lastUpgradedFuses(), expectedFuses, "Fuses should include set fuses plus automatic ones");
        assertTrue(upgradeContract.lastUpgradedFuses() & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP");
        assertTrue(upgradeContract.lastUpgradedFuses() & CANNOT_SET_RESOLVER != 0, "Should have CANNOT_SET_RESOLVER");
        assertTrue(upgradeContract.lastUpgradedFuses() & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL");
        assertTrue(upgradeContract.lastUpgradedFuses() & IS_DOT_ETH != 0, "Should have IS_DOT_ETH");
        
        vm.stopPrank();
    }
    
    function testUpgradeWithExtraData() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        bytes memory extraData = hex"01234567";
        
        nameWrapper.upgrade(dnsName, extraData);
        
        // Check extra data was passed
        assertEq(upgradeContract.lastUpgradedExtraData(), extraData, "Extra data should be passed");
        
        vm.stopPrank();
    }
    
    function testUpgradeWithApproval() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        // Set approval for the token
        nameWrapper.approve(NEW_OWNER, TEST_NODE_ID);
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        nameWrapper.upgrade(dnsName, "");
        
        // Check approval was passed
        assertEq(upgradeContract.lastUpgradedApproved(), NEW_OWNER, "Approved address should be passed");
        
        vm.stopPrank();
    }
    
    function testUpgradeSubdomain() public {
        vm.startPrank(OWNER);
        
        // Set up TLD
        string memory tldLabel = "xyz";
        bytes32 tldLabelHash = keccak256(bytes(tldLabel));
        bytes32 tldNode = keccak256(abi.encodePacked(ROOT_NODE, tldLabelHash));
        
        ens.setSubnodeOwner(ROOT_NODE, tldLabelHash, OWNER);
        ens.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap TLD
        bytes memory tldDnsName = _getDNSEncodedName(tldLabel);
        nameWrapper.wrap(tldDnsName, OWNER, address(0));
        
        // Create subdomain
        nameWrapper.setSubnodeOwner(
            tldNode,
            CHILD_LABEL,
            OWNER,
            0,
            0
        );
        
        bytes32 subNode = keccak256(abi.encodePacked(tldNode, CHILD_LABEL_HASH));
        uint256 subNodeId = uint256(subNode);
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        bytes memory subDnsName = abi.encodePacked(uint8(3), CHILD_LABEL, uint8(3), tldLabel, uint8(0));
        nameWrapper.upgrade(subDnsName, "");
        
        // Check subdomain upgrade
        assertEq(nameWrapper.ownerOf(subNodeId), address(0), "Subdomain should not be owned after upgrade");
        assertEq(upgradeContract.lastUpgradedOwner(), OWNER, "Original owner should be passed");
        
        vm.stopPrank();
    }
    
    function testCannotUpgradeTwice() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        
        // First upgrade should work
        nameWrapper.upgrade(dnsName, "");
        
        // Second upgrade should fail
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", TEST_NODE, OWNER));
        nameWrapper.upgrade(dnsName, "");
        
        vm.stopPrank();
    }
    
    function testUpgradeKeepsFusesAndExpiryInStorage() public {
        vm.startPrank(OWNER);
        
        // Register and wrap with fuses
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Get initial state
        (, uint32 initialFuses, uint64 initialExpiry) = nameWrapper.getData(TEST_NODE_ID);
        
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        nameWrapper.upgrade(dnsName, "");
        
        // Check fuses and expiry are preserved in storage even though token is burned
        (, uint32 storedFuses, uint64 storedExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(storedFuses, initialFuses, "Fuses should be preserved in storage");
        assertEq(storedExpiry, initialExpiry, "Expiry should be preserved in storage");
        
        vm.stopPrank();
    }
    
    function testUpgradeWithSubdomainFuses() public {
        vm.startPrank(OWNER);
        
        // Register and wrap parent
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(TEST_LABEL, OWNER, uint16(CANNOT_UNWRAP), address(0));
        
        // Create subdomain with fuses
        nameWrapper.setSubnodeOwner(
            TEST_NODE,
            CHILD_LABEL,
            OWNER,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER,
            MAX_EXPIRY
        );
        
        // Set upgrade contract
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        // Get expected values
        (, uint32 expectedFuses, uint64 expectedExpiry) = nameWrapper.getData(CHILD_NODE_ID);
        
        bytes memory childDnsName = abi.encodePacked(uint8(3), CHILD_LABEL, uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        nameWrapper.upgrade(childDnsName, "");
        
        // Check fuses were passed correctly
        assertEq(upgradeContract.lastUpgradedFuses(), expectedFuses, "Subdomain fuses should be passed");
        assertEq(upgradeContract.lastUpgradedExpiry(), expectedExpiry, "Subdomain expiry should be passed");
        
        vm.stopPrank();
    }
    
    function testUpgradeCorrectExpiry() public {
        _wrapETH2LD();
        
        vm.startPrank(OWNER);
        
        // Get expected expiry (registrar expiry + grace period)
        uint256 registrarExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        uint64 expectedExpiry = uint64(registrarExpiry + baseRegistrar.GRACE_PERIOD());
        
        nameWrapper.setUpgradeContract(INameWrapperUpgrade(address(upgradeContract)));
        
        bytes memory dnsName = abi.encodePacked(uint8(8), TEST_LABEL, uint8(3), "eth", uint8(0));
        nameWrapper.upgrade(dnsName, "");
        
        // Check expiry was passed correctly
        assertEq(upgradeContract.lastUpgradedExpiry(), expectedExpiry, "Expiry should match registrar + grace period");
        
        vm.stopPrank();
    }
}

/**
 * @dev Mock upgrade contract for testing
 */
contract MockUpgradeContract is INameWrapperUpgrade {
    string public lastUpgradedName;
    address public lastUpgradedOwner;
    uint32 public lastUpgradedFuses;
    uint64 public lastUpgradedExpiry;
    address public lastUpgradedApproved;
    bytes public lastUpgradedExtraData;
    
    event NameUpgraded(
        bytes name,
        address owner,
        uint32 fuses,
        uint64 expiry,
        address approved,
        bytes extraData
    );
    
    function wrapFromUpgrade(
        bytes calldata name,
        address wrappedOwner,
        uint32 fuses,
        uint64 expiry,
        address approved,
        bytes calldata extraData
    ) external override {
        lastUpgradedName = string(name);
        lastUpgradedOwner = wrappedOwner;
        lastUpgradedFuses = fuses;
        lastUpgradedExpiry = expiry;
        lastUpgradedApproved = approved;
        lastUpgradedExtraData = extraData;
        
        emit NameUpgraded(name, wrappedOwner, fuses, expiry, approved, extraData);
    }
}

