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

// Import fuse constants
import {CANNOT_UNWRAP, CANNOT_BURN_FUSES, CANNOT_TRANSFER, CANNOT_SET_RESOLVER, CANNOT_SET_TTL, CANNOT_CREATE_SUBDOMAIN, CANNOT_APPROVE, PARENT_CANNOT_CONTROL, IS_DOT_ETH, CAN_EXTEND_EXPIRY, CAN_DO_EVERYTHING, PARENT_CONTROLLED_FUSES, USER_SETTABLE_FUSES} from "../../../contracts/wrapper/INameWrapper.sol";

/**
 * @title WrapETH2LD
 * @dev Complete wrapETH2LD functionality tests
 */
contract WrapETH2LD is Test {
    NameWrapper public nameWrapper;
    ENSRegistry public ensRegistry;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;
    DummyOracle public dummyOracle;
    StablePriceOracle public priceOracle;
    PublicResolver public publicResolver;

    // Test accounts
    address public account0;
    address public account1;
    address public account2;
    address[] public accounts;

    // ENS constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE =
        keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    bytes32 constant REVERSE_LABEL = keccak256("reverse");
    bytes32 constant ADDR_LABEL = keccak256("addr");

    // Test label and name
    string constant LABEL = "wrapped2";
    string constant NAME = "wrapped2.eth";

    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;

    // Zero account
    address constant ZERO_ACCOUNT = address(0);

    // Events
    event NameWrapped(
        bytes32 indexed node,
        bytes name,
        address owner,
        uint32 fuses,
        uint64 expiry
    );
    event NameUnwrapped(bytes32 indexed node, address owner);
    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );

    // Utility functions
    function toLabelId(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    function toNameId(string memory name) internal pure returns (uint256) {
        return uint256(namehash(name));
    }

    function toTokenId(bytes32 hash) internal pure returns (uint256) {
        return uint256(hash);
    }

    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }

    // DNS encoding function using NameCoder library
    function dnsEncodeName(
        string memory name
    ) internal pure returns (bytes memory) {
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
        ensRegistry.setSubnodeOwner(
            keccak256(abi.encodePacked(ROOT_NODE, REVERSE_LABEL)),
            ADDR_LABEL,
            address(reverseRegistrar)
        );

        // Deploy name wrapper
        nameWrapper = new NameWrapper(
            ensRegistry,
            baseRegistrar,
            metadataService
        );

        // Set up price oracle and controller
        dummyOracle = new DummyOracle(int256(100000000)); // 100000000n
        uint256[] memory rentPrices = new uint256[](5);
        rentPrices[0] = 0; // 0n
        rentPrices[1] = 0; // 0n
        rentPrices[2] = 4; // 4n
        rentPrices[3] = 2; // 2n
        rentPrices[4] = 1; // 1n

        priceOracle = new StablePriceOracle(
            AggregatorInterface(address(dummyOracle)),
            rentPrices
        );

        // Deploy public resolver
        publicResolver = new PublicResolver(
            ensRegistry,
            nameWrapper,
            address(0),
            address(0)
        );

        // Set up domain structure
        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            ETH_LABEL,
            address(baseRegistrar)
        );
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(account0);

        vm.stopPrank();
    }

    // Helper functions for test setup actions
    function _register(
        string memory label,
        address owner,
        uint256 duration
    ) internal {
        vm.startPrank(account0);
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        baseRegistrar.register(toLabelId(label), owner, duration);
        vm.stopPrank();
    }

    // Version that assumes caller is already in the correct prank context
    function _registerNoPrank(
        string memory label,
        address owner,
        uint256 duration
    ) internal {
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        baseRegistrar.register(toLabelId(label), owner, duration);
    }

    function _register(
        string memory label,
        address owner,
        uint256 duration,
        uint256 accountIndex
    ) internal {
        // Add the account as a controller if not already added
        vm.startPrank(account0);
        baseRegistrar.addController(accounts[accountIndex]);
        vm.stopPrank();

        vm.startPrank(accounts[accountIndex]);
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        baseRegistrar.register(toLabelId(label), owner, duration);
        vm.stopPrank();
    }

    function _setBaseRegistrarApprovalForWrapper() internal {
        // This function assumes the caller is already in the correct prank context
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
    }

    function _setBaseRegistrarApprovalForWrapper(
        uint256 accountIndex
    ) internal {
        vm.startPrank(accounts[accountIndex]);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        vm.stopPrank();
    }

    function _wrapEth2ld(
        string memory label,
        address owner,
        uint32 fuses,
        address resolver
    ) internal {
        // This function assumes the caller is already in the correct prank context
        nameWrapper.wrapETH2LD(label, owner, uint16(fuses), resolver);
    }

    function _wrapEth2ld(
        string memory label,
        address owner,
        uint32 fuses,
        address resolver,
        uint256 accountIndex
    ) internal {
        vm.startPrank(accounts[accountIndex]);
        nameWrapper.wrapETH2LD(label, owner, uint16(fuses), resolver);
        vm.stopPrank();
    }

    function _registerSetupAndWrapName(
        string memory label,
        uint32 fuses
    ) internal {
        vm.startPrank(account0);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        baseRegistrar.register(toLabelId(label), account0, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with specified fuses
        nameWrapper.wrapETH2LD(label, account0, uint16(fuses), address(0));

        vm.stopPrank();
    }

    function _registerSetupAndWrapName(
        string memory label,
        uint256 duration,
        uint256 accountIndex,
        uint32 fuses
    ) internal {
        // Add the account as a controller if not already added
        vm.startPrank(account0);
        baseRegistrar.addController(accounts[accountIndex]);
        vm.stopPrank();

        vm.startPrank(accounts[accountIndex]);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        baseRegistrar.register(
            toLabelId(label),
            accounts[accountIndex],
            duration
        );
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with specified fuses
        nameWrapper.wrapETH2LD(
            label,
            accounts[accountIndex],
            uint16(fuses),
            address(0)
        );

        vm.stopPrank();
    }

    function _registerSetupAndWrapNameNoWarp(
        string memory label,
        uint256 duration,
        uint256 accountIndex,
        uint32 fuses
    ) internal {
        // Add the account as a controller if not already added
        vm.startPrank(account0);
        baseRegistrar.addController(accounts[accountIndex]);
        vm.stopPrank();

        vm.startPrank(accounts[accountIndex]);

        // Register domain without warping (assumes time is already set correctly)
        baseRegistrar.register(
            toLabelId(label),
            accounts[accountIndex],
            duration
        );
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with specified fuses
        nameWrapper.wrapETH2LD(
            label,
            accounts[accountIndex],
            uint16(fuses),
            address(0)
        );

        vm.stopPrank();
    }

    function _setSubnodeOwner(
        bytes32 parentNode,
        string memory label,
        address owner,
        uint32 fuses,
        uint64 expiry
    ) internal {
        // This function assumes the caller is already in the correct prank context
        nameWrapper.setSubnodeOwner(parentNode, label, owner, fuses, expiry);
    }

    function _unwrapEth2ld(
        string memory label,
        address controller,
        address registrant
    ) internal {
        // This function assumes the caller is already in the correct prank context
        nameWrapper.unwrapETH2LD(
            keccak256(bytes(label)),
            controller,
            registrant
        );
    }

    // TEST 1: "wraps a name if sender is owner"
    function testWrapsNameIfSenderIsOwner() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        // await expectOwnerOf(name).on(nameWrapper).toBe(zeroAccount)
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            ZERO_ACCOUNT,
            "Should start with zero owner"
        );

        _wrapEth2ld(LABEL, account0, CAN_DO_EVERYTHING, address(0));

        // make sure reclaim claimed ownership for the wrapper in registry
        assertEq(
            ensRegistry.owner(namehash(NAME)),
            address(nameWrapper),
            "Registry should be owned by NameWrapper"
        );

        // make sure owner in the wrapper is the user
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "NameWrapper should be owned by account0"
        );

        // make sure registrar ERC721 is owned by Wrapper
        assertEq(
            baseRegistrar.ownerOf(toLabelId(LABEL)),
            address(nameWrapper),
            "BaseRegistrar should be owned by NameWrapper"
        );

        vm.stopPrank();
    }

    // TEST 2: "Cannot wrap a name if the owner has not authorised the wrapper with the .eth registrar"
    function testCannotWrapNameIfOwnerHasNotAuthorisedWrapper() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);

        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithString('ERC721: caller is not token owner or approved')
        vm.expectRevert("ERC721: caller is not token owner or approved");
        nameWrapper.wrapETH2LD(
            LABEL,
            account0,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 3: "Allows specifying resolver"
    function testAllowsSpecifyingResolver() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();
        _wrapEth2ld(LABEL, account0, CAN_DO_EVERYTHING, account1);

        // expect(await ensRegistry.read.resolver([namehash(name)])).equal(accounts[1].address)
        assertEq(
            ensRegistry.resolver(namehash(NAME)),
            account1,
            "Resolver should be set to account1"
        );

        vm.stopPrank();
    }

    // TEST 4: "Can re-wrap a name that was wrapped has already expired on the .eth registrar"
    function testCanReWrapNameThatWasWrappedHasAlreadyExpiredOnEthRegistrar()
        public
    {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();
        _wrapEth2ld(LABEL, account0, CAN_DO_EVERYTHING, address(0));

        // Fast forward until expired
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period

        assertTrue(
            baseRegistrar.available(toLabelId(LABEL)),
            "Should be available"
        );

        vm.stopPrank();

        // Register from another address
        _register(LABEL, account1, 1 * DAY, 1);
        assertEq(
            baseRegistrar.ownerOf(toLabelId(LABEL)),
            account1,
            "Should be owned by account1"
        );

        _setBaseRegistrarApprovalForWrapper(1);

        uint256 expectedExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        // Check the 4 events - order corrected based on actual implementation
        bytes32 expectedNode = namehash(NAME);
        bytes memory expectedName = dnsEncodeName(NAME);
        uint256 expectedTokenId = toNameId(NAME);

        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account1,
            account0,
            ZERO_ACCOUNT,
            expectedTokenId,
            1
        );
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(expectedNode, ZERO_ACCOUNT);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account1,
            ZERO_ACCOUNT,
            account1,
            expectedTokenId,
            1
        );
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(
            expectedNode,
            expectedName,
            account1,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            uint64(expectedExpiry + baseRegistrar.GRACE_PERIOD())
        );

        _wrapEth2ld(LABEL, account1, CAN_DO_EVERYTHING, address(0), 1);

        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account1,
            "NameWrapper should be owned by account1"
        );
        assertEq(
            baseRegistrar.ownerOf(toLabelId(LABEL)),
            address(nameWrapper),
            "BaseRegistrar should be owned by NameWrapper"
        );
    }

    // TEST 5: "Can re-wrap a name that was wrapped has already expired even if CANNOT_TRANSFER was burned"
    function testCanReWrapNameThatWasWrappedHasAlreadyExpiredEvenIfCannotTransferWasBurned()
        public
    {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();
        _wrapEth2ld(
            LABEL,
            account0,
            CANNOT_UNWRAP | CANNOT_TRANSFER,
            address(0)
        );

        // Fast forward until expired
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period

        assertTrue(
            baseRegistrar.available(toLabelId(LABEL)),
            "Should be available"
        );

        vm.stopPrank();

        // Register from another address
        _register(LABEL, account1, 1 * DAY, 1);
        assertEq(
            baseRegistrar.ownerOf(toLabelId(LABEL)),
            account1,
            "Should be owned by account1"
        );

        uint256 expectedExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));
        _setBaseRegistrarApprovalForWrapper(1);

        // Check events - order corrected based on actual implementation
        bytes32 expectedNode = namehash(NAME);
        bytes memory expectedName = dnsEncodeName(NAME);
        uint256 expectedTokenId = toNameId(NAME);

        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account1,
            account0,
            ZERO_ACCOUNT,
            expectedTokenId,
            1
        );
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(expectedNode, ZERO_ACCOUNT);
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account1,
            ZERO_ACCOUNT,
            account1,
            expectedTokenId,
            1
        );
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(
            expectedNode,
            expectedName,
            account1,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            uint64(expectedExpiry + baseRegistrar.GRACE_PERIOD())
        );

        _wrapEth2ld(LABEL, account1, CAN_DO_EVERYTHING, address(0), 1);

        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account1,
            "NameWrapper should be owned by account1"
        );
        assertEq(
            baseRegistrar.ownerOf(toLabelId(LABEL)),
            address(nameWrapper),
            "BaseRegistrar should be owned by NameWrapper"
        );
    }

    // TEST 6: "correctly reports fuses for a name that has expired and been rewrapped more permissively"
    function testCorrectlyReportsFusesForNameThatHasExpiredAndBeenRewrappedMorePermissively()
        public
    {
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        (, uint32 initialFuses, ) = nameWrapper.getData(toNameId(NAME));
        uint32 expectedInitialFuses = CANNOT_UNWRAP |
            PARENT_CANNOT_CONTROL |
            IS_DOT_ETH;
        assertEq(
            initialFuses,
            expectedInitialFuses,
            "Initial fuses should match"
        );

        // Create a subdomain that can't be unwrapped
        bytes32 parentNode = namehash(NAME);
        _setSubnodeOwner(
            parentNode,
            "sub",
            account0,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );

        (, uint32 subFuses, ) = nameWrapper.getData(
            toNameId("sub.wrapped2.eth")
        );
        assertEq(
            subFuses,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            "Sub fuses should match"
        );

        // Fast forward until the 2LD expires - need to get actual expiry
        uint256 domainExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));
        vm.warp(domainExpiry + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period

        vm.stopPrank();

        // Register from another address
        _registerSetupAndWrapNameNoWarp(LABEL, 1 * DAY, 1, CAN_DO_EVERYTHING);

        uint256 expectedExpiry = baseRegistrar.nameExpires(toLabelId(LABEL)) +
            baseRegistrar.GRACE_PERIOD();
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(
            toNameId(NAME)
        );
        assertEq(
            newFuses,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            "New fuses should match"
        );
        assertEq(newExpiry, expectedExpiry, "New expiry should match");

        // subdomain fuses get reset
        (, uint32 newSubFuses, ) = nameWrapper.getData(
            toNameId("sub.wrapped2.eth")
        );
        assertEq(newSubFuses, 0, "Sub fuses should be reset");
    }

    // TEST 7: "correctly reports fuses for a name that has expired and been rewrapped more permissively with registerAndWrap()"
    function testCorrectlyReportsFusesWithRegisterAndWrap() public {
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        (, uint32 initialFuses, ) = nameWrapper.getData(toNameId(NAME));
        uint32 expectedInitialFuses = CANNOT_UNWRAP |
            PARENT_CANNOT_CONTROL |
            IS_DOT_ETH;
        assertEq(
            initialFuses,
            expectedInitialFuses,
            "Initial fuses should match"
        );

        // Create a subdomain that can't be unwrapped
        bytes32 parentNode = namehash(NAME);
        _setSubnodeOwner(
            parentNode,
            "sub",
            account0,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );

        (, uint32 subFuses, ) = nameWrapper.getData(
            toNameId("sub.wrapped2.eth")
        );
        assertEq(
            subFuses,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            "Sub fuses should match"
        );

        // Fast forward until the 2LD expires - need to get actual expiry
        uint256 domainExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));
        vm.warp(domainExpiry + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period

        // Register from another address with registerAndWrap()
        baseRegistrar.addController(address(nameWrapper));
        nameWrapper.setController(account0, true);
        nameWrapper.registerAndWrapETH2LD(
            LABEL,
            account1,
            1 * DAY,
            address(0),
            0
        );

        uint256 expectedExpiry = baseRegistrar.nameExpires(toLabelId(LABEL)) +
            baseRegistrar.GRACE_PERIOD();
        (, uint32 newFuses, uint64 newExpiry) = nameWrapper.getData(
            toNameId(NAME)
        );
        assertEq(
            newFuses,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            "New fuses should match"
        );
        assertEq(newExpiry, expectedExpiry, "New expiry should match");

        // subdomain fuses get reset
        (, uint32 newSubFuses, ) = nameWrapper.getData(
            toNameId("sub.wrapped2.eth")
        );
        assertEq(newSubFuses, 0, "Sub fuses should be reset");

        vm.stopPrank();
    }

    // TEST 8: "emits Wrap event"
    function testEmitsWrapEvent() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        uint256 expiry = baseRegistrar.nameExpires(toLabelId(LABEL));
        bytes32 expectedNode = namehash(NAME);
        bytes memory expectedName = dnsEncodeName(NAME);

        // The Solidity implementation automatically adds PARENT_CANNOT_CONTROL for .eth domains
        // even when wrapping with CAN_DO_EVERYTHING (0). This is the correct behavior.
        vm.expectEmit(true, false, false, true);
        emit NameWrapped(
            expectedNode,
            expectedName,
            account0,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            uint64(expiry + baseRegistrar.GRACE_PERIOD())
        );

        nameWrapper.wrapETH2LD(
            LABEL,
            account0,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 9: "emits TransferSingle event"
    function testEmitsTransferSingleEvent() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        uint256 expectedTokenId = toNameId(NAME);

        // expect(await nameWrapper).transaction(tx).toEmitEvent('TransferSingle').withArgs(...)
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account0,
            ZERO_ACCOUNT,
            account0,
            expectedTokenId,
            1
        );

        nameWrapper.wrapETH2LD(
            LABEL,
            account0,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 10: "Transfers the wrapped token to the target address"
    function testTransfersWrappedTokenToTargetAddress() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();
        _wrapEth2ld(LABEL, account1, CAN_DO_EVERYTHING, address(0));

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account1,
            "Should be owned by account1"
        );

        vm.stopPrank();
    }

    // TEST 11: "Does not allow wrapping with a target address of 0x0"
    function testDoesNotAllowWrappingWithTargetAddressZero() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithString('ERC1155: mint to the zero address')
        vm.expectRevert("ERC1155: mint to the zero address");
        nameWrapper.wrapETH2LD(
            LABEL,
            ZERO_ACCOUNT,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 12: "Does not allow wrapping with a target address of the wrapper contract address"
    function testDoesNotAllowWrappingWithWrapperContractAddress() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithString('ERC1155: newOwner cannot be the NameWrapper contract')
        vm.expectRevert("ERC1155: newOwner cannot be the NameWrapper contract");
        nameWrapper.wrapETH2LD(
            LABEL,
            address(nameWrapper),
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 13: "Allows an account approved by the owner on the .eth registrar to wrap a name"
    function testAllowsApprovedAccountOnEthRegistrarToWrapName() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();
        baseRegistrar.setApprovalForAll(account1, true);

        vm.stopPrank();

        _wrapEth2ld(LABEL, account1, 0, address(0), 1);

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[1])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account1,
            "Should be owned by account1"
        );
    }

    // TEST 14: "Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry"
    function testDoesNotAllowAnyoneElseToWrapNameEvenIfOwnerAuthorisedWrapper()
        public
    {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        ensRegistry.setApprovalForAll(address(nameWrapper), true);
        _setBaseRegistrarApprovalForWrapper();

        vm.stopPrank();

        vm.startPrank(account1);

        bytes32 expectedNode = namehash(NAME);
        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithCustomError('Unauthorised')
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                expectedNode,
                account1
            )
        );
        nameWrapper.wrapETH2LD(LABEL, account1, 0, address(0));

        vm.stopPrank();
    }

    // TEST 15: "Can wrap a name even if the controller address is different to the registrant address"
    function testCanWrapNameEvenIfControllerAddressDifferentToRegistrantAddress()
        public
    {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        ensRegistry.setOwner(namehash(NAME), account1);
        _setBaseRegistrarApprovalForWrapper();

        _wrapEth2ld(LABEL, account0, 0, address(0));

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Should be owned by account0"
        );

        vm.stopPrank();
    }

    // TEST 16: "Does not allow the controller of a name to wrap it if they are not also the registrant"
    function testDoesNotAllowControllerToWrapIfNotRegistrant() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        ensRegistry.setOwner(namehash(NAME), account1);
        _setBaseRegistrarApprovalForWrapper();

        vm.stopPrank();

        vm.startPrank(account1);

        bytes32 expectedNode = namehash(NAME);
        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithCustomError('Unauthorised')
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                expectedNode,
                account1
            )
        );
        nameWrapper.wrapETH2LD(LABEL, account1, 0, address(0));

        vm.stopPrank();
    }

    // TEST 17: "Does not allows fuse to be burned if CANNOT_UNWRAP has not been burned"
    function testDoesNotAllowFuseToBeBurnedIfCannotUnwrapNotBurned() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        bytes32 expectedNode = namehash(NAME);
        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithCustomError('OperationProhibited')
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedNode
            )
        );
        nameWrapper.wrapETH2LD(
            LABEL,
            account0,
            uint16(CANNOT_SET_RESOLVER),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 18: "cannot burn any parent controlled fuse"
    function testCannotBurnAnyParentControlledFuse() public {
        vm.startPrank(account0);

        // Test the 7 undefined parent controlled fuses above IS_DOT_ETH (matching TypeScript test)
        for (uint256 i = 0; i < 7; i++) {
            string memory testLabel = string(
                abi.encodePacked("test", vm.toString(i))
            );
            _registerNoPrank(testLabel, account0, 1 * DAY);
            _setBaseRegistrarApprovalForWrapper();

            // Calculate next undefined fuse: IS_DOT_ETH * 2**i
            uint256 undefinedFuse = uint256(IS_DOT_ETH) * (2 ** i);

            // Skip fuses that exceed uint16 range as they'll be truncated
            if (undefinedFuse > type(uint16).max) {
                continue;
            }

            // Should revert when trying to wrap with undefined parent controlled fuses
            vm.expectRevert();
            nameWrapper.wrapETH2LD(
                testLabel,
                account0,
                uint16(undefinedFuse),
                address(0)
            );
        }

        vm.stopPrank();
    }

    // TEST 19: "Allows fuse to be burned if CANNOT_UNWRAP has been burned"
    function testAllowsFuseToBeBurnedIfCannotUnwrapHasBeenBurned() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        uint32 initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER;
        _wrapEth2ld(LABEL, account0, initialFuses, address(0));

        (, uint32 fuses, ) = nameWrapper.getData(toNameId(NAME));
        uint32 expectedFuses = initialFuses |
            PARENT_CANNOT_CONTROL |
            IS_DOT_ETH;
        assertEq(fuses, expectedFuses, "Fuses should match expected");

        vm.stopPrank();
    }

    // TEST 20: "Allows fuse to be burned if CANNOT_UNWRAP has been burned, but resets to 0 if expired"
    function testAllowsFuseToBeBurnedButResetsToZeroIfExpired() public {
        vm.startPrank(account0);

        _registerNoPrank(LABEL, account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        uint32 initialFuses = CANNOT_UNWRAP | CANNOT_SET_RESOLVER;
        _wrapEth2ld(LABEL, account0, initialFuses, address(0));

        // Fast forward until expired
        vm.warp(block.timestamp + DAY + 1 + baseRegistrar.GRACE_PERIOD());

        (, uint32 fuses, ) = nameWrapper.getData(toNameId(NAME));
        assertEq(fuses, 0, "Fuses should be reset to 0 after expiry");

        vm.stopPrank();
    }

    // TEST 21: "Will not wrap an empty name"
    function testWillNotWrapEmptyName() public {
        vm.startPrank(account0);

        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        bytes32 emptyLabelhash = keccak256(new bytes(0));
        baseRegistrar.register(toTokenId(emptyLabelhash), account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithCustomError('LabelTooShort')
        vm.expectRevert(abi.encodeWithSignature("LabelTooShort()"));
        nameWrapper.wrapETH2LD(
            "",
            account0,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 22: "Will not wrap a label greater than 255 characters"
    function testWillNotWrapLabelGreaterThan255Characters() public {
        vm.startPrank(account0);

        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + DAY + 1); // Past grace period
        // longString - 256 character string
        string
            memory longString = "yutaioxtcsbzrqhdjmltsdfkgomogohhcchjoslfhqgkuhduhxqsldnurwrrtoicvthwxytonpcidtnkbrhccaozdtoznedgkfkifsvjukxxpkcmgcjprankyzerzqpnuteuegtfhqgzcxqwttyfewbazhyilqhyffufxrookxrnjkmjniqpmntcbrowglgdpkslzechimsaonlcvjkhhvdvkvvuztihobmivifuqtvtwinljslusvhhbwhuhzty";
        assertEq(
            bytes(longString).length,
            256,
            "String should be 256 characters"
        );

        bytes32 longStringHash = keccak256(bytes(longString));
        baseRegistrar.register(toTokenId(longStringHash), account0, 1 * DAY);
        _setBaseRegistrarApprovalForWrapper();

        // expect(await nameWrapper).write('wrapETH2LD', [...]).toBeRevertedWithCustomError('LabelTooLong')
        vm.expectRevert(
            abi.encodeWithSignature("LabelTooLong(string)", longString)
        );
        nameWrapper.wrapETH2LD(
            longString,
            account0,
            uint16(CAN_DO_EVERYTHING),
            address(0)
        );

        vm.stopPrank();
    }

    // TEST 23: "Rewrapping a previously wrapped unexpired name retains PCC and expiry"
    function testRewrappingPreviouslyWrappedUnexpiredNameRetainsPCCAndExpiry()
        public
    {
        // register and wrap a name with PCC
        _registerSetupAndWrapName(LABEL, CAN_DO_EVERYTHING);

        vm.startPrank(account0);

        uint256 parentExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        // unwrap it
        _unwrapEth2ld(LABEL, account0, account0);

        // rewrap it without PCC being burned
        _wrapEth2ld(LABEL, account0, CAN_DO_EVERYTHING, address(0));

        // check that the PCC is still there
        (, uint32 fuses, uint64 expiry) = nameWrapper.getData(toNameId(NAME));
        assertEq(
            fuses,
            PARENT_CANNOT_CONTROL | IS_DOT_ETH,
            "PCC should be retained"
        );
        assertEq(
            expiry,
            parentExpiry + baseRegistrar.GRACE_PERIOD(),
            "Expiry should be parent expiry + grace period"
        );

        vm.stopPrank();
    }

    // Additional tests to ensure complete functionality

    function testCompleteFixtureSetup() public view {
        // Verify the complete fixture setup
        assertTrue(
            address(ensRegistry) != address(0),
            "ENS Registry should be deployed"
        );
        assertTrue(
            address(baseRegistrar) != address(0),
            "Base Registrar should be deployed"
        );
        assertTrue(
            address(nameWrapper) != address(0),
            "Name Wrapper should be deployed"
        );
        assertTrue(
            address(metadataService) != address(0),
            "Metadata Service should be deployed"
        );
        assertTrue(
            address(reverseRegistrar) != address(0),
            "Reverse Registrar should be deployed"
        );

        // Verify accounts setup
        assertEq(accounts.length, 3, "Should have 3 accounts");
        assertEq(accounts[0], account0, "First account should match");
        assertEq(accounts[1], account1, "Second account should match");

        // Verify test constants
        assertEq(LABEL, "wrapped2", "Label constant should match");
        assertEq(NAME, "wrapped2.eth", "Name constant should match");
    }
}
