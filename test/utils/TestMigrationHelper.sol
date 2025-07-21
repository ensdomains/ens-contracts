// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import {ENSRegistry} from "../../contracts/registry/ENSRegistry.sol";
import {BaseRegistrarImplementation} from "../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {ReverseRegistrar} from "../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {IMetadataService} from "../../contracts/wrapper/IMetadataService.sol";
import {IBaseRegistrar} from "../../contracts/ethregistrar/IBaseRegistrar.sol";
import {INameWrapper} from "../../contracts/wrapper/INameWrapper.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

import {MigrationHelper} from "../../contracts/utils/MigrationHelper.sol";

import {ENSTestUtils} from "../utils/ENSTestUtils.sol";
import {ENSTestConstants} from "../utils/ENSTestConstants.sol";
import {TestAccounts} from "../utils/TestAccounts.sol";

// Mock NameWrapper implementation to avoid import conflicts
contract MockNameWrapper is ERC1155 {
    ENSRegistry public immutable ens;
    IBaseRegistrar public immutable registrar;
    mapping(address => bool) public controllers;
    mapping(uint256 => address) public owners;

    event NameWrapped(
        bytes32 indexed node,
        bytes name,
        address owner,
        uint32 fuses,
        uint64 expiry
    );

    constructor(ENSRegistry _ens, IBaseRegistrar _registrar) ERC1155("") {
        ens = _ens;
        registrar = _registrar;
    }

    function setController(address controller, bool active) external {
        controllers[controller] = active;
    }

    function registerAndWrapETH2LD(
        string calldata label,
        address owner,
        uint256 duration,
        address resolver,
        uint32 fuses
    ) external returns (uint64 expiry) {
        bytes32 labelhash = keccak256(bytes(label));
        uint256 labelId = uint256(labelhash);

        // For wrapped names, the token ID is the namehash of the full domain
        bytes32 ethNode = keccak256(
            abi.encodePacked(bytes32(0), keccak256("eth"))
        );
        bytes32 nameNode = keccak256(abi.encodePacked(ethNode, labelhash));
        uint256 tokenId = uint256(nameNode);

        // Register the name in BaseRegistrar
        registrar.register(labelId, address(this), duration);

        // Mint the wrapped token
        _mint(owner, tokenId, 1, "");
        owners[tokenId] = owner;

        return uint64(block.timestamp + duration);
    }

    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public override {
        super.safeBatchTransferFrom(from, to, ids, amounts, data);

        // Update ownership tracking
        for (uint256 i = 0; i < ids.length; i++) {
            owners[ids[i]] = to;
        }

        // TransferBatch event is automatically emitted by ERC1155
    }

    function setApprovalForAll(
        address operator,
        bool approved
    ) public override {
        super.setApprovalForAll(operator, approved);
    }
}

// MockNameWrapper remains as we need it to avoid NameWrapper import conflicts

/**
 * @title TestMigrationHelper
 * @dev Tests MigrationHelper utility for migrating both wrapped and unwrapped ENS names between accounts
 */
contract TestMigrationHelper is Test {
    // Core contracts
    ENSRegistry public ensRegistry;
    BaseRegistrarImplementation public baseRegistrar;
    ReverseRegistrar public reverseRegistrar;
    MockNameWrapper public nameWrapper;
    MigrationHelper public migrationHelper;

    // Test accounts
    address public ownerAccount;
    address public registrantAccount;
    address public otherAccount;

    // ENS constants from library
    bytes32 constant ZERO_HASH = ENSTestConstants.ZERO_HASH;
    bytes32 constant ROOT_NODE = ENSTestConstants.ROOT_NODE;
    bytes32 constant ETH_LABEL = ENSTestConstants.ETH_LABEL;
    bytes32 constant ETH_NODE = ENSTestConstants.ETH_NODE;
    bytes32 constant REVERSE_NODE = ENSTestConstants.REVERSE_NODE;
    bytes32 constant ADDR_LABEL = ENSTestConstants.ADDR_LABEL;

    // Registration constants
    uint64 constant REGISTRATION_TIME = 86400; // 1 day

    function setUp() public {
        // Create test accounts
        ownerAccount = TestAccounts.owner();
        registrantAccount = TestAccounts.account1();
        otherAccount = TestAccounts.account2();

        vm.label(ownerAccount, "ownerAccount");
        vm.label(registrantAccount, "registrantAccount");
        vm.label(otherAccount, "otherAccount");

        // Fund accounts
        vm.deal(ownerAccount, 100 ether);
        vm.deal(registrantAccount, 100 ether);
        vm.deal(otherAccount, 100 ether);

        vm.startPrank(ownerAccount);

        // Deploy ENS Registry
        ensRegistry = new ENSRegistry();

        // Deploy BaseRegistrar
        baseRegistrar = new BaseRegistrarImplementation(ensRegistry, ETH_NODE);

        // Deploy ReverseRegistrar
        reverseRegistrar = new ReverseRegistrar(ensRegistry);

        // Set up reverse registrar
        ensRegistry.setSubnodeOwner(
            ZERO_HASH,
            keccak256("reverse"),
            ownerAccount
        );
        ensRegistry.setSubnodeOwner(
            REVERSE_NODE,
            ADDR_LABEL,
            address(reverseRegistrar)
        );

        // Deploy MockNameWrapper
        nameWrapper = new MockNameWrapper(ensRegistry, baseRegistrar);

        // Set up ENS .eth domain
        ensRegistry.setSubnodeOwner(
            ZERO_HASH,
            ETH_LABEL,
            address(baseRegistrar)
        );

        // Set up controllers
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(ownerAccount);
        nameWrapper.setController(ownerAccount, true);

        // Warp time to ensure names are available (after any potential grace period)
        vm.warp(block.timestamp + 91 days);

        // Deploy real MigrationHelper - cast MockNameWrapper to INameWrapper
        migrationHelper = new MigrationHelper(
            baseRegistrar,
            INameWrapper(address(nameWrapper))
        );
        migrationHelper.setController(ownerAccount, true);

        vm.stopPrank();
    }

    function labelhash(string memory label) internal pure returns (bytes32) {
        return ENSTestUtils.labelhash(label);
    }

    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }

    // Test 1: 'should allow the owner to set a migration target'
    function testShouldAllowTheOwnerToSetAMigrationTarget() public {
        vm.startPrank(ownerAccount);

        vm.expectEmit(true, false, false, false);
        emit MigrationTargetUpdated(ownerAccount);
        migrationHelper.setMigrationTarget(ownerAccount);

        assertEq(migrationHelper.migrationTarget(), ownerAccount);

        vm.stopPrank();
    }

    // Test 2: 'should not allow non-owners to set migration targets'
    function testShouldNotAllowNonOwnersToSetMigrationTargets() public {
        vm.prank(registrantAccount);
        vm.expectRevert("Ownable: caller is not the owner");
        migrationHelper.setMigrationTarget(ownerAccount);
    }

    // Test 3: 'should refuse to migrate unwrapped names to the zero address'
    function testShouldRefuseToMigrateUnwrappedNamesToTheZeroAddress() public {
        // Register names
        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(labelhash("test"));
        ids[1] = uint256(labelhash("test2"));

        vm.startPrank(ownerAccount);
        for (uint256 i = 0; i < ids.length; i++) {
            baseRegistrar.register(
                ids[i],
                registrantAccount,
                REGISTRATION_TIME
            );
        }
        vm.stopPrank();

        // Set approval
        vm.prank(registrantAccount);
        baseRegistrar.setApprovalForAll(address(migrationHelper), true);

        // Try to migrate without setting target (should fail)
        vm.prank(ownerAccount);
        vm.expectRevert(abi.encodeWithSignature("MigrationTargetNotSet()"));
        migrationHelper.migrateNames(registrantAccount, ids, "test");
    }

    // Test 4: 'should migrate unwrapped names'
    function testShouldMigrateUnwrappedNames() public {
        // Register names
        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(labelhash("test"));
        ids[1] = uint256(labelhash("test2"));

        vm.startPrank(ownerAccount);
        for (uint256 i = 0; i < ids.length; i++) {
            baseRegistrar.register(
                ids[i],
                registrantAccount,
                REGISTRATION_TIME
            );
        }
        vm.stopPrank();

        // Set approval
        vm.prank(registrantAccount);
        baseRegistrar.setApprovalForAll(address(migrationHelper), true);

        // Set migration target
        vm.prank(ownerAccount);
        migrationHelper.setMigrationTarget(ownerAccount);

        // Migrate names
        vm.prank(ownerAccount);
        vm.expectEmit(true, true, true, false);
        emit Transfer(registrantAccount, ownerAccount, ids[0]);
        vm.expectEmit(true, true, true, false);
        emit Transfer(registrantAccount, ownerAccount, ids[1]);
        migrationHelper.migrateNames(registrantAccount, ids, "test");

        // Verify ownership transferred
        assertEq(baseRegistrar.ownerOf(ids[0]), ownerAccount);
        assertEq(baseRegistrar.ownerOf(ids[1]), ownerAccount);
    }

    // Test 5: 'should only allow controllers to migrate unwrapped names'
    function testShouldOnlyAllowControllersToMigrateUnwrappedNames() public {
        // Register names
        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(labelhash("test"));
        ids[1] = uint256(labelhash("test2"));

        vm.startPrank(ownerAccount);
        for (uint256 i = 0; i < ids.length; i++) {
            baseRegistrar.register(
                ids[i],
                registrantAccount,
                REGISTRATION_TIME
            );
        }
        migrationHelper.setMigrationTarget(ownerAccount);
        vm.stopPrank();

        // Set approval
        vm.prank(registrantAccount);
        baseRegistrar.setApprovalForAll(address(migrationHelper), true);

        // Try to migrate as registrant (should fail)
        vm.prank(registrantAccount);
        vm.expectRevert("Controllable: Caller is not a controller");
        migrationHelper.migrateNames(registrantAccount, ids, "test");
    }

    // Test 6: 'should migrate wrapped names'
    function testShouldMigrateWrappedNames() public {
        // Register and wrap names
        string[] memory labels = new string[](2);
        labels[0] = "test";
        labels[1] = "test2";

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(namehash("test.eth"));
        ids[1] = uint256(namehash("test2.eth"));

        vm.startPrank(ownerAccount);
        for (uint256 i = 0; i < labels.length; i++) {
            nameWrapper.registerAndWrapETH2LD(
                labels[i],
                registrantAccount,
                REGISTRATION_TIME,
                address(0),
                0
            );
        }
        migrationHelper.setMigrationTarget(ownerAccount);
        vm.stopPrank();

        // Set approval
        vm.prank(registrantAccount);
        nameWrapper.setApprovalForAll(address(migrationHelper), true);

        // Create amounts array (all 1s for ERC1155)
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        // Migrate wrapped names
        vm.prank(ownerAccount);
        migrationHelper.migrateWrappedNames(registrantAccount, ids, "test");

        // Verify ownership transferred
        assertEq(nameWrapper.ownerOf(ids[0]), ownerAccount);
        assertEq(nameWrapper.ownerOf(ids[1]), ownerAccount);
    }

    // Test 7: 'should refuse to migrate wrapped names to the zero address'
    function testShouldRefuseToMigrateWrappedNamesToTheZeroAddress() public {
        // Register and wrap names
        string[] memory labels = new string[](2);
        labels[0] = "test";
        labels[1] = "test2";

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(namehash("test.eth"));
        ids[1] = uint256(namehash("test2.eth"));

        vm.startPrank(ownerAccount);
        for (uint256 i = 0; i < labels.length; i++) {
            nameWrapper.registerAndWrapETH2LD(
                labels[i],
                registrantAccount,
                REGISTRATION_TIME,
                address(0),
                0
            );
        }
        vm.stopPrank();

        // Set approval
        vm.prank(registrantAccount);
        nameWrapper.setApprovalForAll(address(migrationHelper), true);

        // Try to migrate without setting target (should fail)
        vm.prank(ownerAccount);
        vm.expectRevert(abi.encodeWithSignature("MigrationTargetNotSet()"));
        migrationHelper.migrateWrappedNames(registrantAccount, ids, "test");
    }

    // Test 8: 'should only allow controllers to migrate wrapped names'
    function testShouldOnlyAllowControllersToMigrateWrappedNames() public {
        // Register and wrap names
        string[] memory labels = new string[](2);
        labels[0] = "test";
        labels[1] = "test2";

        uint256[] memory ids = new uint256[](2);
        ids[0] = uint256(namehash("test.eth"));
        ids[1] = uint256(namehash("test2.eth"));

        vm.startPrank(ownerAccount);
        for (uint256 i = 0; i < labels.length; i++) {
            nameWrapper.registerAndWrapETH2LD(
                labels[i],
                registrantAccount,
                REGISTRATION_TIME,
                address(0),
                0
            );
        }
        migrationHelper.setMigrationTarget(ownerAccount);
        vm.stopPrank();

        // Set approval
        vm.prank(registrantAccount);
        nameWrapper.setApprovalForAll(address(migrationHelper), true);

        // Try to migrate as registrant (should fail)
        vm.prank(registrantAccount);
        vm.expectRevert("Controllable: Caller is not a controller");
        migrationHelper.migrateWrappedNames(registrantAccount, ids, "test");
    }

    // Events for testing
    event MigrationTargetUpdated(address indexed target);
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );
}
