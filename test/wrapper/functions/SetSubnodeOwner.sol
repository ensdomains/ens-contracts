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
import {AggregatorInterface} from "../../../contracts/ethregistrar/StablePriceOracle.sol";
import "../../../contracts/resolvers/PublicResolver.sol";
import {ReverseRegistrar} from "../../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {MockMetadataService} from "../../utils/MockMetadataService.sol";

import {ENSTestUtils} from "../../utils/ENSTestUtils.sol";
import {ENSTestConstants} from "../../utils/ENSTestConstants.sol";
import {TestAccounts} from "../../utils/TestAccounts.sol";
import "../../../contracts/utils/NameCoder.sol";

/**
 * @title SetSubnodeOwner
 * @dev Complete setSubnodeOwner functionality tests
 */
contract SetSubnodeOwner is Test {
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

    // Test labels and names
    string constant LABEL = "ownerandwrap";
    string constant NAME = "ownerandwrap.eth";
    string constant SUBLABEL = "sub";
    string constant SUBNAME = "sub.ownerandwrap.eth";

    // Time constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;

    // Zero account constant zeroAccount
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

    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }

    // DNS encoding utility function using NameCoder library
    function _dnsEncodeName(
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
        baseRegistrar.addController(address(0));
        baseRegistrar.addController(account0);
        nameWrapper.setController(address(0), true);

        // Set registry approval for wrapper actions.setRegistryApprovalForWrapper
        ensRegistry.setApprovalForAll(address(nameWrapper), true);

        vm.stopPrank();
    }

    // Helper function for test setup setSubnodeOwnerFixture
    function _setSubnodeOwnerFixture() internal {
        vm.startPrank(account0);

        // Move past grace period and register domain
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);
        baseRegistrar.register(toLabelId(LABEL), account0, 365 days);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap domain with CANNOT_UNWRAP
        nameWrapper.wrapETH2LD(
            LABEL,
            account0,
            uint16(CANNOT_UNWRAP),
            address(0)
        );

        vm.stopPrank();
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

    function _setSubnodeOwner(
        bytes32 parentNode,
        string memory label,
        address owner,
        uint32 fuses,
        uint64 expiry
    ) internal {
        nameWrapper.setSubnodeOwner(parentNode, label, owner, fuses, expiry);
    }

    function _setSubnodeOwner(
        bytes32 parentNode,
        string memory label,
        address owner,
        uint32 fuses,
        uint64 expiry,
        uint256 accountIndex
    ) internal {
        vm.startPrank(accounts[accountIndex]);
        nameWrapper.setSubnodeOwner(parentNode, label, owner, fuses, expiry);
        vm.stopPrank();
    }

    // TEST 1: "Can be called by the owner of a name and sets this contract as owner on the ENS registry"
    function testCanBeCalledByOwnerAndSetsContractAsOwnerOnENSRegistry()
        public
    {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Parent should be owned by account0"
        );

        bytes32 parentNode = namehash(NAME);
        _setSubnodeOwner(parentNode, SUBLABEL, account0, CAN_DO_EVERYTHING, 0);

        // await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
        assertEq(
            ensRegistry.owner(namehash(SUBNAME)),
            address(nameWrapper),
            "ENS should be owned by NameWrapper"
        );

        // await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account0,
            "NameWrapper should be owned by account0"
        );

        vm.stopPrank();
    }

    // TEST 2: "Can be called by an account authorised by the owner"
    function testCanBeCalledByAuthorisedAccount() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Parent should be owned by account0"
        );

        nameWrapper.setApprovalForAll(account1, true);

        vm.stopPrank();

        vm.startPrank(account1);

        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account0, 0, 0);

        // await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
        assertEq(
            ensRegistry.owner(namehash(SUBNAME)),
            address(nameWrapper),
            "ENS should be owned by NameWrapper"
        );

        // await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account0,
            "NameWrapper should be owned by account0"
        );

        vm.stopPrank();
    }

    // TEST 3: "Transfers the wrapped token to the target address"
    function testTransfersWrappedTokenToTargetAddress() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Parent should be owned by account0"
        );

        bytes32 parentNode = namehash(NAME);
        _setSubnodeOwner(parentNode, SUBLABEL, account1, CAN_DO_EVERYTHING, 0);

        // await expectOwnerOf(subname).on(ensRegistry).toBe(nameWrapper)
        assertEq(
            ensRegistry.owner(namehash(SUBNAME)),
            address(nameWrapper),
            "ENS should be owned by NameWrapper"
        );

        // await expectOwnerOf(subname).on(nameWrapper).toBe(accounts[1])
        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account1,
            "NameWrapper should be owned by account1"
        );

        vm.stopPrank();
    }

    // TEST 4: "Will not allow wrapping with a target address of 0x0"
    function testWillNotAllowWrappingWithTargetAddressZero() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Parent should be owned by account0"
        );

        bytes32 parentNode = namehash(NAME);
        // await expect(nameWrapper).write('setSubnodeOwner', [...]).toBeRevertedWithString('ERC1155: mint to the zero address')
        vm.expectRevert("ERC1155: mint to the zero address");
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            ZERO_ACCOUNT,
            CAN_DO_EVERYTHING,
            0
        );

        vm.stopPrank();
    }

    // TEST 5: "Will not allow wrapping with a target address of the wrapper contract address"
    function testWillNotAllowWrappingWithWrapperContractAddress() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        // await expect(nameWrapper).write('setSubnodeOwner', [...]).toBeRevertedWithString('ERC1155: newOwner cannot be the NameWrapper contract')
        vm.expectRevert("ERC1155: newOwner cannot be the NameWrapper contract");
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            address(nameWrapper),
            CAN_DO_EVERYTHING,
            0
        );

        vm.stopPrank();
    }

    // TEST 6: "Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry"
    function testDoesNotAllowAnyoneElseToWrapNameEvenIfOwnerAuthorisedWrapper()
        public
    {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        // await expectOwnerOf(name).on(nameWrapper).toBe(accounts[0])
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Parent should be owned by account0"
        );

        // TODO: this is not testing what the description of the test is (note to myself; TS setSubnodeOwner.ts L143)
        ensRegistry.setApprovalForAll(account1, true);

        vm.stopPrank();

        vm.startPrank(account1);

        bytes32 parentNode = namehash(NAME);
        bytes32 expectedParentNode = namehash(NAME);
        // await expect(nameWrapper).write('setSubnodeOwner', [...]).toBeRevertedWithCustomError('Unauthorised')
        vm.expectRevert(
            abi.encodeWithSignature(
                "Unauthorised(bytes32,address)",
                expectedParentNode,
                account1
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CAN_DO_EVERYTHING,
            0
        );

        vm.stopPrank();
    }

    // TEST 7: "Fuses cannot be burned if the name does not have PARENT_CANNOT_CONTROL burned"
    function testFusesCannotBeBurnedIfNameDoesNotHaveParentCannotControlBurned()
        public
    {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CAN_DO_EVERYTHING);

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        bytes32 expectedSubnode = namehash(SUBNAME);
        // await expect(nameWrapper).write('setSubnodeOwner', [...]).toBeRevertedWithCustomError('OperationProhibited')
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CANNOT_UNWRAP | CANNOT_TRANSFER,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }

    // TEST 8: "Does not allow fuses to be burned if CANNOT_UNWRAP is not burned"
    function testDoesNotAllowFusesToBeBurnedIfCannotUnwrapNotBurned() public {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CAN_DO_EVERYTHING);

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        bytes32 expectedSubnode = namehash(SUBNAME);
        // await expect(nameWrapper).write('setSubnodeOwner', [...]).toBeRevertedWithCustomError('OperationProhibited')
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            PARENT_CANNOT_CONTROL | CANNOT_TRANSFER,
            0
        );

        vm.stopPrank();
    }

    // TEST 9: "Allows fuses to be burned if CANNOT_UNWRAP and PARENT_CANNOT_CONTROL is burned and is not expired"
    function testAllowsFusesToBeBurnedIfCannotUnwrapAndParentCannotControlBurnedAndNotExpired()
        public
    {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER,
            MAX_EXPIRY
        );

        bytes32 subnodeHash = namehash(SUBNAME);
        uint32 expectedFuses = CANNOT_UNWRAP |
            PARENT_CANNOT_CONTROL |
            CANNOT_SET_RESOLVER;
        // expect(await nameWrapper.read.allFusesBurned([namehash(subname), CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_SET_RESOLVER])).toEqual(true)
        assertTrue(
            nameWrapper.allFusesBurned(subnodeHash, expectedFuses),
            "All expected fuses should be burned"
        );

        vm.stopPrank();
    }

    // TEST 10: "Does not allow IS_DOT_ETH to be burned"
    function testDoesNotAllowIsDotEthToBeBurned() public {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        bytes32 expectedSubnode = namehash(SUBNAME);
        uint32 invalidFuses = CANNOT_UNWRAP |
            PARENT_CANNOT_CONTROL |
            CANNOT_SET_RESOLVER |
            IS_DOT_ETH;

        // Should revert when trying to burn IS_DOT_ETH on subdomain
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            invalidFuses,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }

    // Additional comprehensive tests to ensure complete functionality

    function testCompleteFixtureSetup() public view {
        // Verify the complete fixture
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
        assertEq(LABEL, "ownerandwrap", "Label constant should match");
        assertEq(NAME, "ownerandwrap.eth", "Name constant should match");
        assertEq(SUBLABEL, "sub", "Sublabel constant should match");
        assertEq(
            SUBNAME,
            "sub.ownerandwrap.eth",
            "Subname constant should match"
        );
    }

    function testSetSubnodeOwnerFixtureSetup() public {
        _setSubnodeOwnerFixture();

        // Verify fixture setup
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Parent domain should be wrapped and owned by account0"
        );
        assertEq(
            ensRegistry.owner(namehash(NAME)),
            address(nameWrapper),
            "Parent domain should be owned by NameWrapper in ENS"
        );

        // Verify fuses are set correctly
        (, uint32 fuses, ) = nameWrapper.getData(toNameId(NAME));
        uint32 expectedFuses = CANNOT_UNWRAP |
            PARENT_CANNOT_CONTROL |
            IS_DOT_ETH;
        assertEq(
            fuses,
            expectedFuses,
            "Parent domain should have expected fuses"
        );
    }

    function testSubnodeCreationWithDifferentFuses() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);

        // Test creating subdomain with different fuse combinations
        uint32[4] memory testFuses = [
            CAN_DO_EVERYTHING,
            PARENT_CANNOT_CONTROL,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | CANNOT_TRANSFER
        ];

        string[4] memory testLabels = ["test1", "test2", "test3", "test4"];

        for (uint256 i = 0; i < testFuses.length; i++) {
            if (i >= 2) {
                // Only test with proper fuse combinations for CANNOT_UNWRAP
                nameWrapper.setSubnodeOwner(
                    parentNode,
                    testLabels[i],
                    account0,
                    testFuses[i],
                    MAX_EXPIRY
                );

                bytes32 subnodeHash = keccak256(
                    abi.encodePacked(
                        parentNode,
                        keccak256(bytes(testLabels[i]))
                    )
                );
                assertTrue(
                    nameWrapper.allFusesBurned(subnodeHash, testFuses[i]),
                    string(
                        abi.encodePacked(
                            "Fuses should be burned for ",
                            testLabels[i]
                        )
                    )
                );
            }
        }

        vm.stopPrank();
    }

    function testSubnodeOwnershipTransfer() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);

        // Create subdomain owned by account1
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            CAN_DO_EVERYTHING,
            0
        );

        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account1,
            "Subdomain should be owned by account1"
        );

        vm.stopPrank();

        // account1 should be able to operate on their subdomain
        vm.startPrank(account1);

        // Transfer subdomain to account2
        nameWrapper.safeTransferFrom(
            account1,
            account2,
            toNameId(SUBNAME),
            1,
            ""
        );

        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account2,
            "Subdomain should be owned by account2 after transfer"
        );

        vm.stopPrank();
    }

    function testSubnodeExpiryHandling() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        uint64 shortExpiry = uint64(block.timestamp + 1 * DAY);

        // Create subdomain with short expiry
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            PARENT_CANNOT_CONTROL,
            shortExpiry
        );

        (, , uint64 expiry) = nameWrapper.getData(toNameId(SUBNAME));
        assertEq(expiry, shortExpiry, "Subdomain should have correct expiry");

        // Fast forward past expiry
        vm.warp(block.timestamp + 2 * DAY);

        // Fuses should be reset after expiry
        (, uint32 fusesAfterExpiry, ) = nameWrapper.getData(toNameId(SUBNAME));
        assertEq(fusesAfterExpiry, 0, "Fuses should be reset after expiry");

        vm.stopPrank();
    }

    function testCannotCreateSubdomainWithoutCannotCreateSubdomainFuse()
        public
    {
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);

        // Burn CANNOT_CREATE_SUBDOMAIN fuse
        nameWrapper.setFuses(parentNode, uint16(CANNOT_CREATE_SUBDOMAIN));

        // Try to create subdomain - should fail
        bytes32 expectedSubnode = namehash(SUBNAME);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CAN_DO_EVERYTHING,
            0
        );

        vm.stopPrank();
    }

    // TEST 11: "Does not allow fuses to be burned if CANNOT_UNWRAP and PARENT_CANNOT_CONTROL are burned, but the name is expired"
    function testDoesNotAllowFusesToBeBurnedIfCannotUnwrapAndParentCannotControlBurnedButExpired()
        public
    {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CAN_DO_EVERYTHING | CANNOT_UNWRAP);

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        (, uint32 parentFuses, ) = nameWrapper.getData(toNameId(NAME));
        uint32 expectedParentFuses = PARENT_CANNOT_CONTROL |
            CANNOT_UNWRAP |
            IS_DOT_ETH;
        assertEq(
            parentFuses,
            expectedParentFuses,
            "Parent should have expected fuses"
        );

        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            0
        ); // set expiry to 0

        assertFalse(
            nameWrapper.allFusesBurned(
                namehash(SUBNAME),
                PARENT_CANNOT_CONTROL
            ),
            "PARENT_CANNOT_CONTROL should not be burned when expired"
        );

        vm.stopPrank();
    }

    // TEST 12: "normalises the max expiry of a subdomain to the parent's expiry"
    function testNormalisesMaxExpiryOfSubdomainToParentExpiry() public {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CAN_DO_EVERYTHING | CANNOT_UNWRAP);

        vm.startPrank(account0);

        uint256 expectedExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        (, , uint64 expiry) = nameWrapper.getData(toNameId(SUBNAME));

        assertEq(
            uint256(expiry),
            expectedExpiry + baseRegistrar.GRACE_PERIOD(),
            "Expiry should be normalised to parent's expiry"
        );

        vm.stopPrank();
    }

    // TEST 13: "Emits Wrap event"
    function testEmitsWrapEvent() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        bytes memory encodedName = _dnsEncodeName(SUBNAME);

        vm.expectEmit(true, false, false, true);
        emit NameWrapped(namehash(SUBNAME), encodedName, account1, 0, 0);

        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account1, 0, 0);

        vm.stopPrank();
    }

    // TEST 14: "Emits TransferSingle event"
    function testEmitsTransferSingleEvent() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);

        vm.expectEmit(true, true, true, true);
        emit TransferSingle(
            account0,
            address(0),
            account1,
            toNameId(SUBNAME),
            1
        );

        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account1, 0, 0);

        vm.stopPrank();
    }

    // TEST 15: "Will not create a subdomain with an empty label"
    function testWillNotCreateSubdomainWithEmptyLabel() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        ensRegistry.setApprovalForAll(address(nameWrapper), true);

        bytes32 parentNode = namehash(NAME);
        vm.expectRevert(abi.encodeWithSignature("LabelTooShort()"));
        nameWrapper.setSubnodeOwner(
            parentNode,
            "",
            account0,
            CAN_DO_EVERYTHING,
            0
        );

        vm.stopPrank();
    }

    // TEST 16: "should be able to call twice and change the owner"
    function testShouldBeAbleToCallTwiceAndChangeOwner() public {
        _setSubnodeOwnerFixture();

        vm.startPrank(account0);

        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account0, 0, 0);

        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account0,
            "Subdomain should be owned by account0"
        );

        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account1, 0, 0);

        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account1,
            "Subdomain should be owned by account1 after second call"
        );

        vm.stopPrank();
    }

    // TEST 17: "setting owner to 0 burns and unwraps"
    function testSettingOwnerToZeroBurnsAndUnwraps() public {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        // Confirm that the name is wrapped
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Name should be wrapped and owned by account0"
        );

        // NameWrapper.setSubnodeOwner to account1
        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            0,
            MAX_EXPIRY
        );

        vm.expectEmit(true, false, false, true);
        emit NameUnwrapped(namehash(SUBNAME), ZERO_ACCOUNT);

        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            ZERO_ACCOUNT,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        require(
            nameWrapper.ownerOf(toNameId(SUBNAME)) == address(0),
            "Subdomain should be burned (owner 0)"
        );

        vm.stopPrank();
    }

    // TEST 18: "Unwrapping within an external contract does not create any state inconsistencies"
    function testUnwrappingWithinExternalContractDoesNotCreateStateInconsistencies()
        public
    {
        _registerSetupAndWrapName(LABEL, CAN_DO_EVERYTHING);

        vm.startPrank(account0);

        // Deploy test reentrancy contract
        TestNameWrapperReentrancy testReentrancy = new TestNameWrapperReentrancy(
                account0,
                address(nameWrapper),
                namehash("test.eth"),
                keccak256(bytes("sub"))
            );

        nameWrapper.setApprovalForAll(address(testReentrancy), true);

        // set self as sub owner
        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            CAN_DO_EVERYTHING,
            MAX_EXPIRY
        );

        // attempt to move owner to testReentrancy, which unwraps domain itself to account while keeping ERC1155 to testReentrancy
        bytes32 expectedSubnode = namehash(SUBNAME);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            address(testReentrancy),
            CANNOT_UNWRAP | PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // reverts because CANNOT_UNWRAP/PCC are burned first, and then unwrap is attempted inside contract, which fails, because CU has already been burned

        vm.stopPrank();
    }

    // TEST 19: "Unwrapping a previously wrapped unexpired name retains PCC and so reverts setSubnodeRecord"
    function testUnwrappingPreviouslyWrappedUnexpiredNameRetainsPCC() public {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        uint256 parentExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        // Confirm that the name is wrapped
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Name should be wrapped and owned by account0"
        );

        // NameWrapper.setSubnodeOwner to account1
        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // Confirm fuses are set
        (, uint32 fusesBefore, ) = nameWrapper.getData(toNameId(SUBNAME));
        assertEq(
            fusesBefore,
            PARENT_CANNOT_CONTROL,
            "PARENT_CANNOT_CONTROL should be set"
        );

        vm.stopPrank();

        // Unwrap as account1
        vm.startPrank(account1);
        nameWrapper.unwrap(parentNode, keccak256(bytes(SUBLABEL)), account1);
        vm.stopPrank();

        vm.startPrank(account0);

        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(
            toNameId(SUBNAME)
        );

        assertEq(owner, address(0), "Owner should be zero after unwrap");
        assertEq(
            uint256(expiry),
            parentExpiry + baseRegistrar.GRACE_PERIOD(),
            "Expiry should be parent expiry + grace period"
        );
        assertEq(
            fuses,
            PARENT_CANNOT_CONTROL,
            "PARENT_CANNOT_CONTROL should remain set"
        );

        bytes32 expectedSubnode = namehash(SUBNAME);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account1, 0, 0);

        vm.stopPrank();
    }

    // TEST 20: "Rewrapping a name that had PCC burned, but has now expired is possible and resets fuses"
    function testRewrappingExpiredNameWithPCCBurnedResetsFuses() public {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        uint256 parentExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        // Confirm that the name is wrapped
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Name should be wrapped and owned by account0"
        );

        // NameWrapper.setSubnodeOwner to account1 with expiry before parent expiry
        bytes32 parentNode = namehash(NAME);
        uint64 shortExpiry = uint64(parentExpiry - DAY / 2); // Expire before parent
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            PARENT_CANNOT_CONTROL,
            shortExpiry
        );

        // Confirm fuses are set
        (, uint32 fusesBefore, ) = nameWrapper.getData(toNameId(SUBNAME));
        assertEq(
            fusesBefore,
            PARENT_CANNOT_CONTROL,
            "PARENT_CANNOT_CONTROL should be set"
        );

        vm.stopPrank();

        // Unwrap as account1
        vm.startPrank(account1);
        nameWrapper.unwrap(parentNode, keccak256(bytes(SUBLABEL)), account1);
        vm.stopPrank();

        vm.startPrank(account0);

        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(
            toNameId(SUBNAME)
        );

        assertEq(owner, address(0), "Owner should be zero after unwrap");
        assertEq(
            uint256(expiry),
            uint256(shortExpiry),
            "Expiry should match short expiry"
        );
        assertEq(
            fuses,
            PARENT_CANNOT_CONTROL,
            "PARENT_CANNOT_CONTROL should remain set"
        );

        // Advance time so the subdomain expires, but not the parent
        vm.warp(parentExpiry - DAY / 4); // Advance past subdomain expiry

        (, uint32 fusesAfter, uint64 expiryAfter) = nameWrapper.getData(
            toNameId(SUBNAME)
        );
        assertEq(
            uint256(expiryAfter),
            uint256(shortExpiry),
            "Expiry should remain the same"
        );
        // NameWrapper automatically resets fuses when expired (see _clearOwnerAndFuses)
        assertEq(fusesAfter, 0, "Fuses should be reset after expiry");

        // Try to re-wrap the expired subdomain - should work since it's expired
        nameWrapper.setSubnodeOwner(parentNode, SUBLABEL, account1, 0, 0);

        uint256 timestamp = block.timestamp;

        assertEq(
            nameWrapper.ownerOf(toNameId(SUBNAME)),
            account1,
            "Subdomain should be owned by account1 after rewrap"
        );

        (address rawOwner, uint32 rawFuses, uint64 expiry2) = nameWrapper
            .getData(toNameId(SUBNAME));
        assertEq(rawFuses, 0, "Raw fuses should be 0");
        assertEq(rawOwner, account1, "Raw owner should be account1");

        // Verify expiry behavior
        assertTrue(
            uint256(expiry2) < timestamp,
            "New expiry should be less than current timestamp"
        );

        vm.stopPrank();
    }

    // TEST 21: "Expired subnames should still be protected by CANNOT_CREATE_SUBDOMAIN on the parent"
    function testExpiredSubnamesProtectedByCannotCreateSubdomainOnParent()
        public
    {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        string memory sublabel2 = "sub2";
        uint256 parentExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        // Confirm that the name is wrapped
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Name should be wrapped and owned by account0"
        );

        // NameWrapper.setSubnodeOwner to account1 with expiry before parent expiry
        bytes32 parentNode = namehash(NAME);
        uint64 shortExpiry = uint64(parentExpiry - DAY / 2); // Expire before parent
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            PARENT_CANNOT_CONTROL,
            shortExpiry
        );

        nameWrapper.setFuses(namehash(NAME), uint16(CANNOT_CREATE_SUBDOMAIN));

        bytes32 expectedSubnode2 = keccak256(
            abi.encodePacked(parentNode, keccak256(bytes(sublabel2)))
        );
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode2
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            sublabel2,
            account1,
            0,
            shortExpiry
        );

        // Advance time past subdomain expiry but before parent expiry
        vm.warp(parentExpiry - DAY / 4); // Advance past subdomain expiry

        uint256 timestamp = block.timestamp;

        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(
            toNameId(SUBNAME)
        );

        // Verify subdomain is expired with proper assertions
        assertEq(
            uint256(expiry),
            uint256(shortExpiry),
            "Expiry should match shortExpiry"
        );
        assertTrue(
            uint256(expiry) < timestamp,
            "Expiry should be less than current timestamp"
        );
        assertEq(fuses, 0, "Fuses should be reset after expiry");

        bytes32 expectedSubnode = namehash(SUBNAME);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            0,
            shortExpiry
        );

        vm.stopPrank();
    }

    // TEST 22: "Burning a name still protects it from the parent as long as it is unexpired and has PCC burnt"
    function testBurningNameStillProtectsFromParentWhenUnexpiredWithPCC()
        public
    {
        // note: not using suite specific fixture here
        _registerSetupAndWrapName(LABEL, CANNOT_UNWRAP);

        vm.startPrank(account0);

        uint256 parentExpiry = baseRegistrar.nameExpires(toLabelId(LABEL));

        // Confirm that the name is wrapped
        assertEq(
            nameWrapper.ownerOf(toNameId(NAME)),
            account0,
            "Name should be wrapped and owned by account0"
        );

        // NameWrapper.setSubnodeOwner to account1
        bytes32 parentNode = namehash(NAME);
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account1,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        // Confirm fuses are set
        (, uint32 fusesBefore, ) = nameWrapper.getData(toNameId(SUBNAME));
        assertEq(
            fusesBefore,
            PARENT_CANNOT_CONTROL,
            "PARENT_CANNOT_CONTROL should be set"
        );

        vm.stopPrank();

        // Unwrap as account1
        vm.startPrank(account1);
        nameWrapper.unwrap(parentNode, keccak256(bytes(SUBLABEL)), account1);
        ensRegistry.setOwner(namehash(SUBNAME), address(0));
        vm.stopPrank();

        vm.startPrank(account0);

        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(
            toNameId(SUBNAME)
        );

        uint256 timestamp = block.timestamp;

        assertEq(owner, address(0), "Owner should be zero after burning");
        assertEq(
            uint256(expiry),
            parentExpiry + baseRegistrar.GRACE_PERIOD(),
            "Expiry should be parent expiry + grace period"
        );
        assertTrue(uint256(expiry) > timestamp, "Should not be expired yet");
        assertEq(
            fuses,
            PARENT_CANNOT_CONTROL,
            "PARENT_CANNOT_CONTROL should remain set"
        );
        assertEq(
            ensRegistry.owner(namehash(SUBNAME)),
            address(0),
            "ENS owner should be zero"
        );

        // attempt to take back the name
        bytes32 expectedSubnode = namehash(SUBNAME);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OperationProhibited(bytes32)",
                expectedSubnode
            )
        );
        nameWrapper.setSubnodeOwner(
            parentNode,
            SUBLABEL,
            account0,
            PARENT_CANNOT_CONTROL,
            MAX_EXPIRY
        );

        vm.stopPrank();
    }
}

/**
 * @dev Test contract for reentrancy testing TestNameWrapperReentrancy
 */
contract TestNameWrapperReentrancy {
    address public account;
    address public nameWrapper;
    bytes32 public testNode;
    bytes32 public subLabel;

    constructor(
        address _account,
        address _nameWrapper,
        bytes32 _testNode,
        bytes32 _subLabel
    ) {
        account = _account;
        nameWrapper = _nameWrapper;
        testNode = _testNode;
        subLabel = _subLabel;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4) {
        // Attempt to unwrap during the transfer callback
        // This should fail because CANNOT_UNWRAP has already been burned
        NameWrapper(nameWrapper).unwrap(testNode, subLabel, account);

        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x4e2312e0; // ERC1155TokenReceiver
    }
}
