// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/registry/FIFSRegistrar.sol";

// Import utility libraries
import {ENSTestUtils} from "../utils/ENSTestUtils.sol";
import {ENSTestConstants} from "../utils/ENSTestConstants.sol";
import {TestAccounts} from "../utils/TestAccounts.sol";

/**
 * @title TestFIFSRegistrar
 * @dev Tests FIFS registrar functionality including name registration and transfer authorization
 */
contract TestFIFSRegistrar is Test {
    ENSRegistry public ensRegistry;
    FIFSRegistrar public fifsRegistrar;

    address public account0;
    address public account1;

    bytes32 constant ZERO_HASH = ENSTestConstants.ZERO_HASH;

    function setUp() public {
        // Create test accounts
        account0 = TestAccounts.owner();
        account1 = TestAccounts.account1();

        // Deploy ENSRegistry
        ensRegistry = new ENSRegistry();

        // Deploy FIFSRegistrar with root node
        fifsRegistrar = new FIFSRegistrar(ensRegistry, ZERO_HASH);

        // Set registrar as owner of root node
        ensRegistry.setOwner(ZERO_HASH, address(fifsRegistrar));

        vm.label(account0, "account0");
        vm.label(account1, "account1");
    }

    function labelhash(string memory label) internal pure returns (bytes32) {
        return ENSTestUtils.labelhash(label);
    }

    function namehash(string memory name) internal pure returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }

    /**
     * Test 1: 'should allow registration of names'
     * Tests basic name registration functionality
     */
    function testShouldAllowRegistrationOfNames() public {
        fifsRegistrar.register(labelhash("eth"), account0);

        assertEq(
            ensRegistry.owner(ZERO_HASH),
            address(fifsRegistrar),
            "Root should be owned by registrar"
        );
        assertEq(
            ensRegistry.owner(namehash("eth")),
            account0,
            "ETH node should be owned by account0"
        );
    }

    /**
     * Test 2: 'should allow transferring name to your own'
     * Tests that owners can transfer their names to others
     */
    function testShouldAllowTransferringNameToYourOwn() public {
        // First register 'eth' to account0 (fixtureWithEthSet equivalent)
        fifsRegistrar.register(labelhash("eth"), account0);

        // In TypeScript, the transfer is done by accounts[0] (the owner)
        // So I needed to prank as account0 to transfer to account1
        vm.prank(account0);
        fifsRegistrar.register(labelhash("eth"), account1);

        // Verify transfer worked
        assertEq(
            ensRegistry.owner(namehash("eth")),
            account1,
            "ETH node should be owned by account1"
        );
    }

    /**
     * Test 3: 'forbids transferring the name you do not own'
     * Tests that non-owners cannot transfer names
     */
    function testForbidsTransferringTheNameYouDoNotOwn() public {
        // First register 'eth' to account0 (fixtureWithEthSet equivalent)
        fifsRegistrar.register(labelhash("eth"), account0);

        // Try to transfer as account1 (non-owner) - should revert without reason
        vm.prank(account1);
        vm.expectRevert(bytes(""));
        fifsRegistrar.register(labelhash("eth"), account1);
    }
}
