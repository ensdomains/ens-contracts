// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../../contracts/wrapper/INameWrapper.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import "../../../contracts/ethregistrar/DummyOracle.sol";
import "../../../contracts/ethregistrar/StablePriceOracle.sol";
import "../../../contracts/resolvers/PublicResolver.sol";
import {AggregatorInterface} from "../../../contracts/ethregistrar/StablePriceOracle.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {ENSTestUtils} from "../../utils/ENSTestUtils.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";
import "../../../contracts/utils/NameCoder.sol";
import {CANNOT_UNWRAP, CANNOT_BURN_FUSES, CANNOT_TRANSFER, CANNOT_SET_RESOLVER, CANNOT_SET_TTL, CANNOT_CREATE_SUBDOMAIN, CANNOT_APPROVE, PARENT_CANNOT_CONTROL, CAN_DO_EVERYTHING, IS_DOT_ETH, CAN_EXTEND_EXPIRY} from "../../../contracts/wrapper/INameWrapper.sol";

/**
 * @title Wrap
 * @dev Complete wrap functionality tests
 */
contract Wrap is Test {
    
    NameWrapper public nameWrapper;
    ENSRegistry public ensRegistry;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;
    DummyOracle public dummyOracle;
    StablePriceOracle public priceOracle;
    PublicResolver public publicResolver;
    NameGriefer public nameGriefer;
    
    // Test accounts
    address public account0;
    address public account1;
    address public account2;
    address[] public accounts;
    
    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE = keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    bytes32 constant REVERSE_LABEL = keccak256("reverse");
    bytes32 constant ADDR_LABEL = keccak256("addr");
    
    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;
    
    // Zero account
    address constant ZERO_ACCOUNT = address(0);
    
    // Events
    event NameWrapped(bytes32 indexed node, bytes name, address owner, uint32 fuses, uint64 expiry);
    event NameUnwrapped(bytes32 indexed node, address owner);
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    
    // Utility functions
    function toLabelId(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
    
    function toNameId(string memory name) internal pure returns (uint256) {
        return uint256(namehash(name));
    }
    
    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }
    
    // DNS encoding function using NameCoder library
    function dnsEncodeName(string memory name) internal pure returns (bytes memory) {
        return NameCoder.encode(name);
    }
    
    function setUp() public {
        // Set up accounts
        account0 = address(0x1111);
        account1 = address(0x2222);
        account2 = address(0x3333);
        accounts.push(account0);
        accounts.push(account1);
        accounts.push(account2);
        
        vm.startPrank(account0);
        
        // Deploy core contracts fixture
        ensRegistry = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ensRegistry, ETH_NODE);
        metadataService = IMetadataService(address(new MockMetadataService()));
        
        // Deploy reverse registrar
        reverseRegistrar = new ReverseRegistrar(ensRegistry);
        
        // Set up reverse registry
        ensRegistry.setSubnodeOwner(ROOT_NODE, REVERSE_LABEL, account0);
        ensRegistry.setSubnodeOwner(keccak256(abi.encodePacked(ROOT_NODE, REVERSE_LABEL)), ADDR_LABEL, address(reverseRegistrar));
        
        // Deploy name wrapper
        nameWrapper = new NameWrapper(ensRegistry, baseRegistrar, metadataService);
        
        // Set up price oracle and controller
        dummyOracle = new DummyOracle(int256(100000000)); // 100000000n
        uint256[] memory rentPrices = new uint256[](5);
        rentPrices[0] = 0; // 0n
        rentPrices[1] = 0; // 0n  
        rentPrices[2] = 4; // 4n
        rentPrices[3] = 2; // 2n
        rentPrices[4] = 1; // 1n
        
        priceOracle = new StablePriceOracle(AggregatorInterface(address(dummyOracle)), rentPrices);
        
        // Deploy public resolver
        publicResolver = new PublicResolver(
            ensRegistry,
            nameWrapper,
            address(0),
            address(0)
        );
        
        // Deploy name griefer contract
        nameGriefer = new NameGriefer(nameWrapper);
        
        // Set up domain structure
        ensRegistry.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(account0);
        
        vm.stopPrank();
    }
    
    // Helper functions for test setup actions
    function _setRegistryApprovalForWrapper() internal {
        ensRegistry.setApprovalForAll(address(nameWrapper), true);
    }
    
    function _setRegistryApprovalForWrapper(uint256 accountIndex) internal {
        vm.startPrank(accounts[accountIndex]);
        ensRegistry.setApprovalForAll(address(nameWrapper), true);
        vm.stopPrank();
    }
    
    function _wrapName(string memory name, address owner, address resolver) internal {
        nameWrapper.wrap(dnsEncodeName(name), owner, resolver);
    }
    
    function _wrapName(string memory name, address owner, address resolver, uint256 accountIndex) internal {
        vm.startPrank(accounts[accountIndex]);
        nameWrapper.wrap(dnsEncodeName(name), owner, resolver);
        vm.stopPrank();
    }
    
    function _registerSetupAndWrapName(string memory label, uint32 fuses) internal {
        vm.startPrank(account0);
        
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(label), account0, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        
        // Wrap domain with specified fuses
        nameWrapper.wrapETH2LD(label, account0, uint16(fuses), address(0));
        
        vm.stopPrank();
    }
    
    function _setSubnodeOwner(bytes32 parentNode, string memory label, address owner, uint32 fuses, uint64 expiry) internal {
        nameWrapper.setSubnodeOwner(parentNode, label, owner, fuses, expiry);
    }
    
    function _unwrapName(bytes32 parentNode, string memory label, address controller) internal {
        nameWrapper.unwrap(parentNode, keccak256(bytes(label)), controller);
    }
    
    function _unwrapName(bytes32 parentNode, string memory label, address controller, uint256 accountIndex) internal {
        vm.startPrank(accounts[accountIndex]);
        nameWrapper.unwrap(parentNode, keccak256(bytes(label)), controller);
        vm.stopPrank();
    }
    
    // TEST 1: "Wraps a name if you are the owner"
    function testWrapsNameIfYouAreTheOwner() public {
        vm.startPrank(account0);
        
        string memory label = "xyz";
        
        // await expectOwnerOf(label).on(nameWrapper).toBe(zeroAccount)
        assertEq(nameWrapper.ownerOf(toNameId(label)), ZERO_ACCOUNT, "Should start with zero owner");
        
        // Set up domain ownership first
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(label)), account0);
        _setRegistryApprovalForWrapper();
        _wrapName(label, account0, address(0));
        
        // await expectOwnerOf(label).on(nameWrapper).toBe(accounts[0])
        assertEq(nameWrapper.ownerOf(toNameId(label)), account0, "Should be owned by account0 after wrap");
        
        vm.stopPrank();
    }
    
    // TEST 2: "Allows specifying resolver"
    function testAllowsSpecifyingResolver() public {
        vm.startPrank(account0);
        
        string memory label = "xyz";
        
        // Set up domain ownership first
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(label)), account0);
        _setRegistryApprovalForWrapper();
        _wrapName(label, account0, account1);
        
        // expect(await ensRegistry.read.resolver([namehash(label)])).equal(accounts[1].address)
        assertEq(ensRegistry.resolver(namehash(label)), account1, "Resolver should be set to account1");
        
        vm.stopPrank();
    }
    
    // TEST 3: "emits event for NameWrapped"
    function testEmitsEventForNameWrapped() public {
        vm.startPrank(account0);
        
        // Set up domain ownership first
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256("xyz"), account0);
        _setRegistryApprovalForWrapper();
        
        bytes32 expectedNode = namehash("xyz");
        bytes memory expectedName = dnsEncodeName("xyz");
        
        // await expect(nameWrapper).write('wrap', [...]).toEmitEvent('NameWrapped').withArgs(...)
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(expectedNode, expectedName, account0, 0, 0);
        
        nameWrapper.wrap(dnsEncodeName("xyz"), account0, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 4: "emits event for TransferSingle"
    function testEmitsEventForTransferSingle() public {
        vm.startPrank(account0);
        
        // Set up domain ownership first
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256("xyz"), account0);
        _setRegistryApprovalForWrapper();
        
        uint256 expectedTokenId = toNameId("xyz");
        
        // await expect(nameWrapper).write('wrap', [...]).toEmitEvent('TransferSingle').withArgs(...)
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(account0, ZERO_ACCOUNT, account0, expectedTokenId, 1);
        
        nameWrapper.wrap(dnsEncodeName("xyz"), account0, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 5: "Cannot wrap a name if the owner has not authorised the wrapper with the ENS registry"
    function testCannotWrapNameIfOwnerHasNotAuthorisedWrapper() public {
        vm.startPrank(account0);
        
        // Should revert without specific reason
        vm.expectRevert();
        nameWrapper.wrap(dnsEncodeName("xyz"), account0, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 6: "Will not allow wrapping with a target address of 0x0"
    function testWillNotAllowWrappingWithTargetAddressZero() public {
        vm.startPrank(account0);
        
        // Set up domain ownership first so we don't hit Unauthorised error
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256("xyz"), account0);
        _setRegistryApprovalForWrapper();
        
        // await expect(nameWrapper).write('wrap', [...]).toBeRevertedWithString('ERC1155: mint to the zero address')
        vm.expectRevert("ERC1155: mint to the zero address");
        nameWrapper.wrap(dnsEncodeName("xyz"), ZERO_ACCOUNT, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 7: "Will not allow wrapping with a target address of the wrapper contract address"
    function testWillNotAllowWrappingWithWrapperContractAddress() public {
        vm.startPrank(account0);
        
        // Set up domain ownership first so we don't hit Unauthorised error
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256("xyz"), account0);
        _setRegistryApprovalForWrapper();
        
        // await expect(nameWrapper).write('wrap', [...]).toBeRevertedWithString('ERC1155: newOwner cannot be the NameWrapper contract')
        vm.expectRevert("ERC1155: newOwner cannot be the NameWrapper contract");
        nameWrapper.wrap(dnsEncodeName("xyz"), address(nameWrapper), address(0));
        
        vm.stopPrank();
    }
    
    // TEST 8: "Allows an account approved by the owner on the ENS registry to wrap a name"
    function testAllowsApprovedAccountOnENSRegistryToWrapName() public {
        string memory label = "abc";
        
        vm.startPrank(account0);
        
        // setup .abc with accounts[1] as owner
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(label)), account1);
        
        vm.stopPrank();
        vm.startPrank(account1);
        
        // allow account to deal with all accounts[1]'s names
        ensRegistry.setApprovalForAll(account0, true);
        _setRegistryApprovalForWrapper();
        
        vm.stopPrank();
        vm.startPrank(account0);
        
        // confirm abc is owner by accounts[1] not accounts[0]
        assertEq(ensRegistry.owner(namehash(label)), account1, "Should be owned by account1 in ENS");
        
        // wrap using accounts[0]
        _wrapName(label, account1, address(0));
        
        // await expectOwnerOf(label).on(nameWrapper).toBe(accounts[1])
        assertEq(nameWrapper.ownerOf(toNameId(label)), account1, "Should be owned by account1 in NameWrapper");
        
        vm.stopPrank();
    }
    
    // TEST 9: "Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry"
    function testDoesNotAllowAnyoneElseToWrapNameEvenIfOwnerAuthorisedWrapper() public {
        string memory label = "abc";
        
        vm.startPrank(account0);
        
        // setup .abc with accounts[1] as owner
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(label)), account1);
        
        vm.stopPrank();
        vm.startPrank(account1);
        
        _setRegistryApprovalForWrapper();
        
        vm.stopPrank();
        vm.startPrank(account0);
        
        // confirm abc is owner by accounts[1] not accounts[0]
        assertEq(ensRegistry.owner(namehash(label)), account1, "Should be owned by account1 in ENS");
        
        bytes32 expectedNode = namehash(label);
        // await expect(nameWrapper).write('wrap', [...]).toBeRevertedWithCustomError('Unauthorised')
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", expectedNode, account0));
        nameWrapper.wrap(dnsEncodeName(label), account1, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 10: "Does not allow wrapping .eth 2LDs"
    function testDoesNotAllowWrappingEth2LDs() public {
        string memory label = "wrapped";
        
        vm.startPrank(account0);
        
        // Register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(label), account0, 1 * DAY);
        _setRegistryApprovalForWrapper();
        
        string memory ethName = string(abi.encodePacked(label, ".eth"));
        // await expect(nameWrapper).write('wrap', [...]).toBeRevertedWithCustomError('IncompatibleParent')
        vm.expectRevert(abi.encodeWithSignature("IncompatibleParent()"));
        nameWrapper.wrap(dnsEncodeName(ethName), account1, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 11: "Can re-wrap a name that was reassigned by an unwrapped parent"
    function testCanReWrapNameThatWasReassignedByUnwrappedParent() public {
        string memory parentLabel = "xyz";
        string memory childLabel = "sub";
        string memory childName = "sub.xyz";
        
        vm.startPrank(account0);
        
        // Set up parent domain first
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(parentLabel)), account0);
        
        // await expectOwnerOf(parentLabel).on(nameWrapper).toBe(zeroAccount)
        assertEq(nameWrapper.ownerOf(toNameId(parentLabel)), ZERO_ACCOUNT, "Parent should start with zero owner");
        
        _setRegistryApprovalForWrapper();
        ensRegistry.setSubnodeOwner(namehash(parentLabel), keccak256(bytes(childLabel)), account0);
        _wrapName(childName, account0, address(0));
        
        // Reassign in ENS registry
        ensRegistry.setSubnodeOwner(namehash(parentLabel), keccak256(bytes(childLabel)), account1);
        
        // await expectOwnerOf(childName).on(ensRegistry).toBe(accounts[1])
        assertEq(ensRegistry.owner(namehash(childName)), account1, "Should be owned by account1 in ENS");
        // await expectOwnerOf(childName).on(nameWrapper).toBe(accounts[0])
        assertEq(nameWrapper.ownerOf(toNameId(childName)), account0, "Should still be owned by account0 in NameWrapper");
        
        vm.stopPrank();
        
        _setRegistryApprovalForWrapper(1);
        
        // Re-wrap as account1
        bytes32 expectedNode = namehash(childName);
        bytes memory expectedName = dnsEncodeName(childName);
        uint256 expectedTokenId = toNameId(childName);
        
        // Check all events are emitted in correct order based on actual implementation:
        // TransferSingle (burn) → NameUnwrapped → TransferSingle (mint) → NameWrapped
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(account1, account0, ZERO_ACCOUNT, expectedTokenId, 1);
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(expectedNode, ZERO_ACCOUNT);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(account1, ZERO_ACCOUNT, account1, expectedTokenId, 1);
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(expectedNode, expectedName, account1, CAN_DO_EVERYTHING, 0);
        
        _wrapName(childName, account1, address(0), 1);
        
        // await expectOwnerOf(childName).on(nameWrapper).toBe(accounts[1])
        assertEq(nameWrapper.ownerOf(toNameId(childName)), account1, "Should be owned by account1 in NameWrapper");
        // await expectOwnerOf(childName).on(ensRegistry).toBe(nameWrapper)
        assertEq(ensRegistry.owner(namehash(childName)), address(nameWrapper), "Should be owned by NameWrapper in ENS");
    }
    
    // TEST 12: "Will not wrap a name with junk at the end"
    function testWillNotWrapNameWithJunkAtEnd() public {
        vm.startPrank(account0);
        
        _setRegistryApprovalForWrapper();
        
        bytes memory invalidName = abi.encodePacked(dnsEncodeName("xyz"), hex"123456");
        
        // await expect(nameWrapper).write('wrap', [...]).toBeRevertedWithString('namehash: Junk at end of name')
        vm.expectRevert("namehash: Junk at end of name");
        nameWrapper.wrap(invalidName, account0, address(0));
        
        vm.stopPrank();
    }
    
    // TEST 13: "Does not allow wrapping a name you do not own"
    function testDoesNotAllowWrappingNameYouDoNotOwn() public {
        string memory label = "xyz";
        
        vm.startPrank(account0);
        
        // Set up domain ownership first
        ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(label)), account0);
        _setRegistryApprovalForWrapper();
        // Register the name to accounts[0]
        _wrapName(label, account0, address(0));
        
        bytes32 expectedNode = namehash(label);
        // Try and burn the name
        vm.expectRevert(abi.encodeWithSignature("Unauthorised(bytes32,address)", expectedNode, address(nameGriefer)));
        nameGriefer.destroy(dnsEncodeName(label));
        
        // Make sure it didn't succeed
        assertEq(nameWrapper.ownerOf(toNameId(label)), account0, "Should still be owned by account0");
        
        vm.stopPrank();
    }
    
    // TEST 14: "Rewrapping a previously wrapped unexpired name retains PCC"
    function testRewrappingPreviouslyWrappedUnexpiredNameRetainsPCC() public {
        string memory label = "test";
        string memory name = "test.eth";
        string memory subLabel = "sub";
        string memory subname = "sub.test.eth";
        
        _registerSetupAndWrapName(label, CANNOT_UNWRAP);
        
        vm.startPrank(account0);
        
        uint256 parentExpiry = baseRegistrar.nameExpires(toLabelId(label));
        
        // Confirm that name is wrapped
        assertEq(nameWrapper.ownerOf(toNameId(name)), account0, "Parent should be wrapped");
        
        // NameWrapper.setSubnodeOwner to accounts[1]
        bytes32 parentNode = namehash(name);
        _setSubnodeOwner(parentNode, subLabel, account1, PARENT_CANNOT_CONTROL, MAX_EXPIRY);
        
        // Confirm fuses are set
        (, uint32 fusesBefore,) = nameWrapper.getData(toNameId(subname));
        assertEq(fusesBefore, PARENT_CANNOT_CONTROL, "PCC should be set before unwrap");
        
        vm.stopPrank();
        
        // Unwrap and re-wrap
        _unwrapName(parentNode, subLabel, account1, 1);
        _setRegistryApprovalForWrapper(1);
        _wrapName(subname, account1, address(0), 1);
        
        (, uint32 fusesAfter, uint64 expiryAfter) = nameWrapper.getData(toNameId(subname));
        assertEq(fusesAfter, PARENT_CANNOT_CONTROL, "PCC should be retained after re-wrap");
        assertEq(expiryAfter, parentExpiry + baseRegistrar.GRACE_PERIOD(), "Expiry should be parent expiry + grace period");
    }
    
    // Additional comprehensive tests to ensure complete functionality
    
    function testCompleteFixtureSetup() public view {
        // Verify the complete fixture setup
        assertTrue(address(ensRegistry) != address(0), "ENS Registry should be deployed");
        assertTrue(address(baseRegistrar) != address(0), "Base Registrar should be deployed");
        assertTrue(address(nameWrapper) != address(0), "Name Wrapper should be deployed");
        assertTrue(address(metadataService) != address(0), "Metadata Service should be deployed");
        assertTrue(address(reverseRegistrar) != address(0), "Reverse Registrar should be deployed");
        assertTrue(address(nameGriefer) != address(0), "Name Griefer should be deployed");
        
        // Verify accounts setup
        assertEq(accounts.length, 3, "Should have 3 accounts");
        assertEq(accounts[0], account0, "First account should match");
        assertEq(accounts[1], account1, "Second account should match");
    }
    
    function testDNSEncoding() public pure {
        // Test DNS encoding function
        bytes memory encoded = dnsEncodeName("example.com");
        bytes memory expected = hex"076578616d706c6503636f6d00";
        assertEq(encoded, expected, "DNS encoding should match expected format");
        
        // Test single label
        bytes memory singleLabel = dnsEncodeName("test");
        bytes memory expectedSingle = hex"047465737400";
        assertEq(singleLabel, expectedSingle, "Single label DNS encoding should work");
        
        // Test empty string
        bytes memory empty = dnsEncodeName("");
        assertEq(empty, hex"00", "Empty string should encode to null byte");
    }
    
    function testWrapDifferentNameTypes() public {
        vm.startPrank(account0);
        _setRegistryApprovalForWrapper();
        
        string[4] memory testNames = ["simple", "with-dash", "123numeric", "a.b.c"];
        
        for (uint256 i = 0; i < testNames.length; i++) {
            string memory name = testNames[i];
            
            // Set up domain ownership for each name
            if (i < 3) {
                // For TLDs, set up as subnode under root
                ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256(bytes(name)), account0);
            } else {
                // For a.b.c, set up the hierarchy
                ensRegistry.setSubnodeOwner(ROOT_NODE, keccak256("c"), account0);
                ensRegistry.setSubnodeOwner(namehash("c"), keccak256("b"), account0);
                ensRegistry.setSubnodeOwner(namehash("b.c"), keccak256("a"), account0);
            }
            
            _wrapName(name, account0, address(0));
            assertEq(nameWrapper.ownerOf(toNameId(name)), account0, "Should be wrapped successfully");
        }
        
        vm.stopPrank();
    }
}

/**
 * @dev Name Griefer contract for testing NameGriefer
 */
contract NameGriefer {
    NameWrapper public immutable nameWrapper;
    
    constructor(NameWrapper _nameWrapper) {
        nameWrapper = _nameWrapper;
    }
    
    function destroy(bytes memory name) external {
        nameWrapper.wrap(name, address(0), address(0));
    }
}

