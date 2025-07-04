// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../../contracts/wrapper/INameWrapper.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

/**
 * @title OnERC721Received
 * @dev onERC721Received functionality tests for NameWrapper
 */
contract OnERC721Received is Test {
    
    NameWrapper public nameWrapper;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;
    
    // Test accounts
    address constant OWNER = address(0x1);
    address constant NEW_OWNER = address(0x2);
    address constant RESOLVER = address(0x3);
    address constant UNAUTHORIZED = address(0x4);
    
    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE = keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    
    // Test domains
    string constant TEST_LABEL = "send2contract";
    bytes32 constant TEST_LABEL_HASH = keccak256(bytes(TEST_LABEL));
    uint256 constant TEST_LABEL_ID = uint256(TEST_LABEL_HASH);
    bytes32 constant TEST_NODE = keccak256(abi.encodePacked(ETH_NODE, TEST_LABEL_HASH));
    uint256 constant TEST_NODE_ID = uint256(TEST_NODE);
    
    // Time constants
    uint256 constant DAY = 86400;
    
    // Events
    event NameWrapped(bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry);
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    
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
    
    function _registerTestDomain() internal {
        vm.startPrank(OWNER);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 365 days);
        
        vm.stopPrank();
    }
    
    function _encodeExtraData(
        string memory label,
        address owner,
        uint16 ownerControlledFuses,
        address resolver
    ) internal pure returns (bytes memory) {
        return abi.encode(label, owner, ownerControlledFuses, resolver);
    }
    
    function testOnERC721ReceivedWrapsAndSetsOwner() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Transfer via safeTransferFrom with data
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check name is wrapped and ownership is correct
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Domain should be wrapped");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), NEW_OWNER, "Should be owned by NEW_OWNER");
        assertEq(ens.owner(TEST_NODE), address(nameWrapper), "ENS should show wrapper as owner");
        assertEq(baseRegistrar.ownerOf(TEST_LABEL_ID), address(nameWrapper), "Registrar should show wrapper as owner");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedWithResolver() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Transfer with resolver specified
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, RESOLVER);
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check resolver was set
        assertEq(ens.resolver(TEST_NODE), RESOLVER, "Resolver should be set");
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Domain should be wrapped");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedWithFuses() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Transfer with fuses
        uint16 fuses = uint16(CANNOT_UNWRAP);
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, fuses, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check fuses were set
        (, uint32 actualFuses,) = nameWrapper.getData(TEST_NODE_ID);
        assertTrue(actualFuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP fuse");
        assertTrue(actualFuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        assertTrue(actualFuses & IS_DOT_ETH != 0, "Should have IS_DOT_ETH fuse");
        
        vm.stopPrank();
    }
    
    function testCannotCallOnERC721ReceivedDirectly() public {
        _registerTestDomain();
        
        vm.startPrank(UNAUTHORIZED);
        
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        vm.expectRevert(abi.encodeWithSignature("IncorrectTokenType()"));
        nameWrapper.onERC721Received(OWNER, OWNER, TEST_LABEL_ID, data);
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedRevertsMismatchedLabel() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Transfer with wrong label in data
        bytes memory data = _encodeExtraData("wronglabel", NEW_OWNER, 0, address(0));
        bytes32 expectedLabelHash = keccak256(bytes(TEST_LABEL));
        bytes32 wrongLabelHash = keccak256(bytes("wronglabel"));
        vm.expectRevert(abi.encodeWithSignature("LabelMismatch(bytes32,bytes32)", wrongLabelHash, expectedLabelHash));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedRevertsWithoutData() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Try to transfer without data
        vm.expectRevert("ERC721: transfer to non ERC721Receiver implementer");
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, "");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedCannotBurnFusesWithoutCannotUnwrap() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Try to burn CANNOT_TRANSFER without CANNOT_UNWRAP
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, uint16(CANNOT_TRANSFER), address(0));
        bytes32 expectedNode = keccak256(abi.encodePacked(keccak256(abi.encodePacked(bytes32(0), keccak256("eth"))), keccak256(bytes(TEST_LABEL))));
        vm.expectRevert(abi.encodeWithSignature("OperationProhibited(bytes32)", expectedNode));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedCanBurnFusesWithCannotUnwrap() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Burn multiple fuses including CANNOT_UNWRAP
        uint16 fuses = uint16(CANNOT_UNWRAP | CANNOT_TRANSFER);
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, fuses, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check fuses were set
        (, uint32 actualFuses,) = nameWrapper.getData(TEST_NODE_ID);
        assertTrue(actualFuses & CANNOT_UNWRAP != 0, "Should have CANNOT_UNWRAP fuse");
        assertTrue(actualFuses & CANNOT_TRANSFER != 0, "Should have CANNOT_TRANSFER fuse");
        assertTrue(actualFuses & PARENT_CANNOT_CONTROL != 0, "Should have PARENT_CANNOT_CONTROL fuse");
        assertTrue(actualFuses & IS_DOT_ETH != 0, "Should have IS_DOT_ETH fuse");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedWorksWithDifferentController() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Change ENS owner to different address
        ens.setOwner(TEST_NODE, NEW_OWNER);
        
        // Transfer should still work
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Verify wrapped
        assertTrue(nameWrapper.isWrapped(TEST_NODE), "Domain should be wrapped");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), NEW_OWNER, "Should be owned by NEW_OWNER");
        assertEq(ens.owner(TEST_NODE), address(nameWrapper), "ENS should show wrapper as owner");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedEmitsEvents() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        uint256 expectedExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID) + baseRegistrar.GRACE_PERIOD();
        bytes memory expectedName = abi.encodePacked(uint8(13), TEST_LABEL, uint8(3), "eth", uint8(0));
        
        // Expect TransferSingle event first
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(address(baseRegistrar), address(0), NEW_OWNER, TEST_NODE_ID, 1);
        
        // Expect NameWrapped event second
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(TEST_NODE, expectedName, NEW_OWNER, PARENT_CANNOT_CONTROL | IS_DOT_ETH, uint64(expectedExpiry));
        
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedSetsCorrectExpiry() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        uint256 registrarExpiry = baseRegistrar.nameExpires(TEST_LABEL_ID);
        
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check expiry is registrar expiry + grace period
        (, , uint64 wrapperExpiry) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(wrapperExpiry, registrarExpiry + baseRegistrar.GRACE_PERIOD(), "Expiry should be registrar expiry + grace period");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedCannotWrapEmptyLabel() public {
        vm.startPrank(OWNER);
        
        // Register empty label
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        bytes32 emptyLabelHash = keccak256("");
        uint256 emptyLabelId = uint256(emptyLabelHash);
        baseRegistrar.register(emptyLabelId, OWNER, 365 days);
        
        // Try to wrap empty label via onERC721Received
        bytes memory data = _encodeExtraData("", NEW_OWNER, 0, address(0));
        vm.expectRevert(abi.encodeWithSignature("LabelTooShort()"));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), emptyLabelId, data);
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedResetsExpiredFuses() public {
        vm.startPrank(OWNER);
        
        // Register domain with short expiry
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(TEST_LABEL_ID, OWNER, 1 days);
        
        // Transfer with fuses
        uint16 fuses = uint16(CANNOT_UNWRAP | CANNOT_TRANSFER);
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, fuses, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Advance time past expiry + grace period
        vm.warp(block.timestamp + 1 days + baseRegistrar.GRACE_PERIOD() + 1);
        
        // Check fuses are reset for expired domain
        (, uint32 actualFuses,) = nameWrapper.getData(TEST_NODE_ID);
        assertEq(actualFuses, 0, "Fuses should be reset for expired domain");
        assertEq(nameWrapper.ownerOf(TEST_NODE_ID), address(0), "Owner should be zero for expired domain");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedChangesBalances() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Check initial balances
        assertEq(nameWrapper.balanceOf(NEW_OWNER, TEST_NODE_ID), 0, "NEW_OWNER should not have token initially");
        
        // Transfer via onERC721Received
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check balances after wrap
        assertEq(nameWrapper.balanceOf(NEW_OWNER, TEST_NODE_ID), 1, "NEW_OWNER should have token");
        
        vm.stopPrank();
    }
    
    function testOnERC721ReceivedAutomaticFuses() public {
        _registerTestDomain();
        
        vm.startPrank(OWNER);
        
        // Transfer with minimal fuses
        bytes memory data = _encodeExtraData(TEST_LABEL, NEW_OWNER, 0, address(0));
        baseRegistrar.safeTransferFrom(OWNER, address(nameWrapper), TEST_LABEL_ID, data);
        
        // Check automatic fuses are set
        (, uint32 fuses,) = nameWrapper.getData(TEST_NODE_ID);
        assertTrue(fuses & PARENT_CANNOT_CONTROL != 0, "Should automatically have PARENT_CANNOT_CONTROL");
        assertTrue(fuses & IS_DOT_ETH != 0, "Should automatically have IS_DOT_ETH");
        
        vm.stopPrank();
    }
}

