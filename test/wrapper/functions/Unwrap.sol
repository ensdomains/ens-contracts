// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../../contracts/wrapper/NameWrapper.sol";
import "../../../contracts/registry/ENSRegistry.sol";
import "../../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {INameWrapper, CANNOT_UNWRAP, PARENT_CANNOT_CONTROL, CAN_DO_EVERYTHING} from "../../../contracts/wrapper/INameWrapper.sol";
import "../../../contracts/wrapper/IMetadataService.sol";
import "../../../contracts/ethregistrar/DummyOracle.sol";
import "../../../contracts/ethregistrar/StablePriceOracle.sol";
import "../../../contracts/resolvers/PublicResolver.sol";
import {AggregatorInterface} from "../../../contracts/ethregistrar/StablePriceOracle.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";

import {ENSTestUtils} from "../../utils/ENSTestUtils.sol";
import {ENSTestConstants} from "../../utils/ENSTestConstants.sol";
import {TestAccounts} from "../../utils/TestAccounts.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";
import "../../../contracts/utils/NameCoder.sol";

/**
 * @title Unwrap
 * @dev Complete unwrap functionality tests
 */
contract Unwrap is Test {
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

    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;

    // Zero account constant zeroAccount
    address constant ZERO_ACCOUNT = address(0);

    // Events
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

    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }

    function _splitName(
        string memory name
    ) internal pure returns (string[] memory) {
        bytes memory nameBytes = bytes(name);
        uint256 parts = 1;
        for (uint256 i = 0; i < nameBytes.length; i++) {
            if (nameBytes[i] == ".") parts++;
        }

        string[] memory labels = new string[](parts);
        uint256 labelIndex = 0;
        uint256 start = 0;

        for (uint256 i = 0; i <= nameBytes.length; i++) {
            if (i == nameBytes.length || nameBytes[i] == ".") {
                bytes memory labelBytes = new bytes(i - start);
                for (uint256 j = 0; j < i - start; j++) {
                    labelBytes[j] = nameBytes[start + j];
                }
                labels[labelIndex] = string(labelBytes);
                labelIndex++;
                start = i + 1;
            }
        }
        return labels;
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

        // Set registry approval for wrapper actions.setRegistryApprovalForWrapper
        ensRegistry.setApprovalForAll(address(nameWrapper), true);

        vm.stopPrank();
    }

    // DNS encoding function using NameCoder library
    function dnsEncodeName(
        string memory name
    ) internal pure returns (bytes memory) {
        return NameCoder.encode(name);
    }

    // Helper functions for test setup actions
    function _wrapName(
        string memory name,
        address owner,
        address resolver
    ) internal {
        nameWrapper.wrap(dnsEncodeName(name), owner, resolver);
    }

    function _registerSetupAndWrapName(
        string memory label,
        uint32 fuses
    ) internal {
        vm.startPrank(account0);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(label), account0, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with specified fuses
        nameWrapper.wrapETH2LD(label, account0, uint16(fuses), address(0));

        vm.stopPrank();
    }

    // Version that assumes caller is already in the correct prank context
    function _registerSetupAndWrapNameNoPrank(
        string memory label,
        uint32 fuses
    ) internal {
        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(label), account0, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with specified fuses
        nameWrapper.wrapETH2LD(label, account0, uint16(fuses), address(0));
    }

    function _setSubnodeOwner(
        bytes32 parentNode,
        string memory label,
        address owner,
        uint32 fuses,
        uint64 expiry
    ) internal {
        nameWrapper.setSubnodeOwner(parentNode, label, owner, fuses, expiry);
    }

    function _unwrapName(
        bytes32 parentNode,
        string memory label,
        address controller
    ) internal {
        nameWrapper.unwrap(parentNode, keccak256(bytes(label)), controller);
    }

    // TEST 1: "Allows owner to unwrap name"
    function testAllowsOwnerToUnwrapName() public {
        vm.startPrank(account0);

        string memory parentLabel = "xyz";
        string memory childLabel = "unwrapped";
        string memory childName = "unwrapped.xyz";

        // Set up domain ownership first, then wrap
        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(parentLabel)),
            account0
        );
        _wrapName(parentLabel, account0, address(0));

        // await actions.setSubnodeOwner.onNameWrapper({ parentName: parentLabel, label: childLabel, owner: accounts[0].address, fuses: CAN_DO_EVERYTHING, expiry: 0n })
        bytes32 parentNode = namehash(parentLabel);
        _setSubnodeOwner(
            parentNode,
            childLabel,
            account0,
            CAN_DO_EVERYTHING,
            0
        );

        // await expectOwnerOf(childName).on(nameWrapper).equal(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(childName)),
            account0,
            "NameWrapper should own child before unwrap"
        );

        // await actions.unwrapName({ parentName: parentLabel, label: childLabel, controller: accounts[0].address })
        _unwrapName(parentNode, childLabel, account0);

        // Transfers ownership in the ENS registry to the target address
        assertEq(
            ensRegistry.owner(namehash(childName)),
            account0,
            "ENS Registry should own child after unwrap"
        );

        vm.stopPrank();
    }

    // TEST 2: "Will not allow previous owner to unwrap name when name expires"
    function testWillNotAllowPreviousOwnerToUnwrapNameWhenNameExpires() public {
        string memory parentLabel = "unwrapped";
        string memory parentName = "unwrapped.eth";
        string memory childLabel = "sub";
        string memory childName = "sub.unwrapped.eth";

        vm.startPrank(account0);

        // Register parent domain with short duration to test expiry logic
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(parentLabel), account0, 1 * DAY);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            parentLabel,
            account0,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        bytes32 parentNode = namehash(parentName);
        // Get parent expiry and use it for child to match normalization behavior
        uint256 parentExpiry = baseRegistrar.nameExpires(
            toLabelId(parentLabel)
        );
        uint64 childExpiry = uint64(
            parentExpiry + baseRegistrar.GRACE_PERIOD()
        );
        _setSubnodeOwner(
            parentNode,
            childLabel,
            account0,
            PARENT_CANNOT_CONTROL,
            childExpiry
        );

        vm.stopPrank();

        // Advance time past the parent's registration expiry (which invalidates the parent)
        // This should make the child unwrappable fail due to parent expiry
        vm.warp(parentExpiry + baseRegistrar.GRACE_PERIOD() + 1 * DAY);

        vm.startPrank(account0);

        bytes32 childNode = namehash(childName);
        // The unwrap should fail because parent domain has expired
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                childNode,
                account0
            )
        );
        nameWrapper.unwrap(parentNode, keccak256(bytes(childLabel)), account0);

        vm.stopPrank();
    }

    // TEST 3: "emits Unwrap event"
    function testEmitsUnwrapEvent() public {
        vm.startPrank(account0);

        string memory label = "xyz";

        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );
        _wrapName(label, account0, address(0));

        bytes32 expectedNode = namehash(label);

        // expect(await nameWrapper).write('unwrap', [...]).toEmitEvent('NameUnwrapped').withArgs(...)
        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(expectedNode, account0);

        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account0);

        vm.stopPrank();
    }

    // TEST 4: "emits TransferSingle event"
    function testEmitsTransferSingleEvent() public {
        vm.startPrank(account0);

        string memory label = "xyz";

        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );
        _wrapName(label, account0, address(0));

        uint256 expectedTokenId = toNameId(label);

        // expect(await nameWrapper).write('unwrap', [...]).toEmitEvent('TransferSingle').withArgs(...)
        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account0,
            account0,
            ZERO_ACCOUNT,
            expectedTokenId,
            1
        );

        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account0);

        vm.stopPrank();
    }

    // TEST 5: "Allows an account authorised by the owner on the NFT Wrapper to unwrap a name"
    function testAllowsAuthorisedAccountOnNFTWrapperToUnwrapName() public {
        string memory label = "abc";

        vm.startPrank(account0);

        // setup .abc with accounts[0] as owner
        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );

        // wrap using accounts[0]
        _wrapName(label, account0, address(0));
        nameWrapper.setApprovalForAll(account1, true);

        // await expectOwnerOf(label).on(nameWrapper).equal(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(label)),
            account0,
            "NameWrapper should own before unwrap"
        );

        vm.stopPrank();

        vm.startPrank(account1);

        // unwrap using accounts[1]
        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account1);

        // await expectOwnerOf(label).on(ensRegistry).equal(accounts[1])
        assertEq(
            ensRegistry.owner(namehash(label)),
            account1,
            "ENS Registry should be owned by account1"
        );

        // await expectOwnerOf(label).on(nameWrapper).equal(zeroAccount)
        assertEq(
            nameWrapper.ownerOf(toNameId(label)),
            ZERO_ACCOUNT,
            "NameWrapper should have zero owner"
        );

        vm.stopPrank();
    }

    // TEST 6: "Does not allow anyone else to unwrap a name"
    function testDoesNotAllowAnyoneElseToUnwrapName() public {
        string memory label = "abc";

        vm.startPrank(account0);

        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );
        _wrapName(label, account0, address(0));

        // await expectOwnerOf(label).on(nameWrapper).equal(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(label)),
            account0,
            "NameWrapper should own before unwrap attempt"
        );

        vm.stopPrank();

        vm.startPrank(account1);

        bytes32 expectedNode = namehash(label);
        // expect(await nameWrapper).write('unwrap', [...]).toBeRevertedWithCustomError('Unauthorised')
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                expectedNode,
                account1
            )
        );
        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account1);

        vm.stopPrank();
    }

    // TEST 6.5: "Does not allow an account authorised by the owner on the ENS registry to unwrap a name"
    function testDoesNotAllowAccountAuthorisedByOwnerOnENSRegistryToUnwrapName()
        public
    {
        string memory label = "abc";

        vm.startPrank(account0);

        // setup .abc with account0 initially (since account0 owns root in setup)
        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );
        // transfer to account1
        ensRegistry.setOwner(namehash(label), account1);

        vm.stopPrank();

        vm.startPrank(account1);

        // allow account0 to deal with all account1's names in ENS registry
        ensRegistry.setApprovalForAll(account0, true);
        ensRegistry.setApprovalForAll(address(nameWrapper), true);

        vm.stopPrank();

        // confirm abc is owned by account1 not account0
        assertEq(
            ensRegistry.owner(namehash(label)),
            account1,
            "ENS Registry should be owned by account1"
        );
        assertTrue(
            ensRegistry.isApprovedForAll(account1, account0),
            "account0 should be approved for all account1's names"
        );

        vm.startPrank(account0);

        // wrap using account0 (this should succeed due to ENS registry approval)
        _wrapName(label, account1, address(0));

        // Verify the name is wrapped and owned by account1
        assertEq(
            nameWrapper.ownerOf(toNameId(label)),
            account1,
            "NameWrapper should be owned by account1"
        );

        // Try to unwrap using account0 (this should fail - no NameWrapper approval)
        bytes32 expectedNode = namehash(label);
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                expectedNode,
                account0
            )
        );
        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account0);

        vm.stopPrank();
    }

    // TEST 7: "Will not unwrap .eth 2LDs"
    function testWillNotUnwrapEth2LDs() public {
        string memory label = "unwrapped";

        _registerSetupAndWrapName(label, 0);

        vm.startPrank(account0);

        string memory ethName = "unwrapped.eth";
        // await expectOwnerOf(`${label}.eth`).on(nameWrapper).equal(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(ethName)),
            account0,
            "NameWrapper should own .eth domain"
        );

        // expect(await nameWrapper).write('unwrap', [...]).toBeRevertedWithCustomError('IncompatibleParent')
        vm.expectRevert(abi.encodeWithSignature("IncompatibleParent()"));
        nameWrapper.unwrap(ETH_NODE, keccak256(bytes(label)), account0);

        vm.stopPrank();
    }

    // TEST 8: "Will not allow a target address of 0x0 or the wrapper contract address"
    function testWillNotAllowTargetAddressZeroOrWrapperContract() public {
        string memory label = "abc";

        vm.startPrank(account0);

        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );
        _wrapName(label, account0, address(0));

        // expect(await nameWrapper).write('unwrap', [...]).toBeRevertedWithCustomError('IncorrectTargetOwner')
        vm.expectRevert(
            abi.encodeWithSignature(
                "IncorrectTargetOwner(address)",
                ZERO_ACCOUNT
            )
        );
        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), ZERO_ACCOUNT);

        vm.expectRevert(
            abi.encodeWithSignature(
                "IncorrectTargetOwner(address)",
                address(nameWrapper)
            )
        );
        nameWrapper.unwrap(
            ROOT_NODE,
            keccak256(bytes(label)),
            address(nameWrapper)
        );

        vm.stopPrank();
    }

    // TEST 9: "Will not allow to unwrap with PCC/CU burned if expired"
    function testWillNotAllowToUnwrapWithPCCCUBurnedIfExpired() public {
        string memory parentLabel = "awesome";
        string memory parentName = "awesome.eth";
        string memory childLabel = "sub";
        string memory childName = "sub.awesome.eth";

        vm.startPrank(account0);

        // Register with 1 day duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(parentLabel), account0, 1 * DAY);

        // Note: baseRegistrar.register() already sets ENS ownership
        // Create subdomain
        ensRegistry.setSubnodeOwner(
            namehash(parentName),
            keccak256(bytes(childLabel)),
            account0
        );

        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            parentLabel,
            account0,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        bytes32 parentNode = namehash(parentName);
        _setSubnodeOwner(
            parentNode,
            childLabel,
            account0,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            0
        );

        // await expectOwnerOf(childName).on(ensRegistry).equal(nameWrapper)
        assertEq(
            ensRegistry.owner(namehash(childName)),
            address(nameWrapper),
            "ENS should be owned by NameWrapper"
        );

        bytes32 childNode = namehash(childName);
        // expect(await nameWrapper).write('unwrap', [...]).toBeRevertedWithCustomError('Unauthorised')
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                childNode,
                account0
            )
        );
        nameWrapper.unwrap(parentNode, keccak256(bytes(childLabel)), account0);

        vm.stopPrank();
    }

    // TEST 10: "Will allow to unwrap with PCC/CU burned if expired and then extended without PCC/CU"
    function testWillAllowToUnwrapWithPCCCUBurnedIfExpiredAndThenExtendedWithoutPCCCU()
        public
    {
        string memory parentLabel = "awesome";
        string memory parentName = "awesome.eth";
        string memory childLabel = "sub";
        string memory childName = "sub.awesome.eth";

        vm.startPrank(account0);

        // Register with 7 days duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(parentLabel), account0, 7 * DAY);

        // Note: baseRegistrar.register() already sets ENS ownership
        // Create subdomain
        ensRegistry.setSubnodeOwner(
            namehash(parentName),
            keccak256(bytes(childLabel)),
            account0
        );

        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            parentLabel,
            account0,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        uint256 timestamp = block.timestamp;
        bytes32 parentNode = namehash(parentName);
        _setSubnodeOwner(
            parentNode,
            childLabel,
            account0,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            uint64(timestamp + DAY)
        );

        // await expectOwnerOf(childName).on(ensRegistry).equal(nameWrapper)
        assertEq(
            ensRegistry.owner(namehash(childName)),
            address(nameWrapper),
            "ENS should be owned by NameWrapper"
        );

        // Advance time by 2 days
        vm.warp(block.timestamp + 2 * DAY);

        bytes32 childNode = namehash(childName);
        // Should fail when expired with PCC/CU burned
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                childNode,
                account0
            )
        );
        nameWrapper.unwrap(parentNode, keccak256(bytes(childLabel)), account0);

        // Reset subdomain without PCC/CU
        _setSubnodeOwner(parentNode, childLabel, account0, 0, MAX_EXPIRY);

        // Now unwrap should work
        nameWrapper.unwrap(parentNode, keccak256(bytes(childLabel)), account0);

        // await expectOwnerOf(childName).on(ensRegistry).equal(accounts[0])
        assertEq(
            ensRegistry.owner(namehash(childName)),
            account0,
            "ENS should be owned by account0 after unwrap"
        );

        vm.stopPrank();
    }

    // TEST 11: "Will not allow to unwrap a name with the CANNOT_UNWRAP fuse burned if not expired"
    function testWillNotAllowToUnwrapNameWithCannotUnwrapFuseBurnedIfNotExpired()
        public
    {
        string memory parentLabel = "abc";
        string memory parentName = "abc.eth";
        string memory childLabel = "sub";
        string memory childName = "sub.abc.eth";

        vm.startPrank(account0);

        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(parentLabel)),
            account0
        );

        // Register with 1 day duration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(parentLabel), account0, 1 * DAY);

        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        nameWrapper.wrapETH2LD(
            parentLabel,
            account0,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        bytes32 parentNode = namehash(parentName);
        _setSubnodeOwner(
            parentNode,
            childLabel,
            account0,
            PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
            MAX_EXPIRY
        );

        bytes32 childNode = namehash(childName);
        // expect(await nameWrapper).write('unwrap', [...]).toBeRevertedWithCustomError('OperationProhibited')
        vm.expectRevert(
            abi.encodeWithSignature("OperationProhibited(bytes32)", childNode)
        );
        nameWrapper.unwrap(parentNode, keccak256(bytes(childLabel)), account0);

        vm.stopPrank();
    }

    // TEST 12: "Unwrapping a previously wrapped unexpired name retains PCC and expiry"
    function testUnwrappingPreviouslyWrappedUnexpiredNameRetainsPCCAndExpiry()
        public
    {
        string memory parentLabel = "test";
        string memory parentName = "test.eth";
        string memory childLabel = "sub";
        string memory childName = "sub.test.eth";

        _registerSetupAndWrapName(parentLabel, CANNOT_UNWRAP);

        vm.startPrank(account0);

        // Confirm that the name is wrapped
        assertEq(
            nameWrapper.ownerOf(toNameId(parentName)),
            account0,
            "Parent should be owned by account0"
        );

        uint256 parentExpiry = baseRegistrar.nameExpires(
            toLabelId(parentLabel)
        );

        // NameWrapper.setSubnodeOwner to accounts[1]
        bytes32 parentNode = namehash(parentName);

        vm.stopPrank();
        vm.startPrank(account0);
        _setSubnodeOwner(
            parentNode,
            childLabel,
            account1,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );
        vm.stopPrank();

        // Confirm fuses are set
        (, uint32 fusesBefore, ) = nameWrapper.getData(toNameId(childName));
        assertEq(
            fusesBefore,
            PARENT_CANNOT_CONTROL,
            "PCC fuse should be set before unwrap"
        );

        vm.startPrank(account1);

        // Unwrap as account1
        nameWrapper.unwrap(parentNode, keccak256(bytes(childLabel)), account1);

        (, uint32 fusesAfter, uint64 expiryAfter) = nameWrapper.getData(
            toNameId(childName)
        );
        assertEq(
            fusesAfter,
            PARENT_CANNOT_CONTROL,
            "PCC fuse should be retained after unwrap"
        );
        assertEq(
            expiryAfter,
            parentExpiry + baseRegistrar.GRACE_PERIOD(),
            "Expiry should be parent expiry + grace period"
        );

        vm.stopPrank();
    }

    // Additional comprehensive tests to ensure complete functionality

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

        // Verify approval setup
        assertTrue(
            ensRegistry.isApprovedForAll(account0, address(nameWrapper)),
            "Registry approval should be set"
        );
    }

    function testUnwrapDifferentNameTypes() public {
        vm.startPrank(account0);

        // Test unwrapping different types of names
        string[3] memory testLabels = ["simple", "with-dash", "123numeric"];

        for (uint256 i = 0; i < testLabels.length; i++) {
            string memory label = testLabels[i];

            // Set up name
            ensRegistry.setSubnodeOwner(
                ROOT_NODE,
                keccak256(bytes(label)),
                account0
            );
            _wrapName(label, account0, address(0));

            // Verify wrapped
            assertEq(
                nameWrapper.ownerOf(toNameId(label)),
                account0,
                "Should be wrapped"
            );

            // Unwrap
            nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account0);

            // Verify unwrapped
            assertEq(
                ensRegistry.owner(namehash(label)),
                account0,
                "Should be unwrapped"
            );
            assertEq(
                nameWrapper.ownerOf(toNameId(label)),
                ZERO_ACCOUNT,
                "Should have zero owner in wrapper"
            );
        }

        vm.stopPrank();
    }

    function testUnwrapWithDifferentTargetAddresses() public {
        vm.startPrank(account0);

        string memory label = "transfer-test";

        // Set up name
        ensRegistry.setSubnodeOwner(
            ROOT_NODE,
            keccak256(bytes(label)),
            account0
        );
        _wrapName(label, account0, address(0));

        // Unwrap to different address
        nameWrapper.unwrap(ROOT_NODE, keccak256(bytes(label)), account1);

        // Verify transferred to target
        assertEq(
            ensRegistry.owner(namehash(label)),
            account1,
            "Should be owned by target address"
        );

        vm.stopPrank();
    }
}
