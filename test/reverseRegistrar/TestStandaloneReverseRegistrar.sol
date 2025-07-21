// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/reverseRegistrar/StandaloneReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/IStandaloneReverseRegistrar.sol";

// Test implementation of StandaloneReverseRegistrar for testing purposes
contract TestableStandaloneReverseRegistrar is StandaloneReverseRegistrar {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Public wrapper for the internal _setName function for testing
    function setName(address addr, string calldata name) external onlyOwner {
        _setName(addr, name);
    }

    // Allow setting name for any address (for testing scenarios)
    function setNameForAddress(
        address addr,
        string calldata name
    ) external onlyOwner {
        _setName(addr, name);
    }

    // Function to transfer ownership for testing
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}

/**
 * @title TestStandaloneReverseRegistrar
 * @dev Tests for StandaloneReverseRegistrar - abstract base contract for reverse name resolution
 */
contract TestStandaloneReverseRegistrar is Test {
    TestableStandaloneReverseRegistrar public standaloneReverseRegistrar;

    // Test accounts
    address public OWNER;
    address public USER1;
    address public USER2;
    address public UNAUTHORIZED;

    // Test data
    string constant TEST_NAME_1 = "alice.eth";
    string constant TEST_NAME_2 = "bob.eth";
    string constant EMPTY_NAME = "";

    // Events
    event NameForAddrChanged(address indexed addr, string name);

    function setUp() public {
        OWNER = vm.addr(1);
        USER1 = vm.addr(2);
        USER2 = vm.addr(3);
        UNAUTHORIZED = vm.addr(4);

        vm.startPrank(OWNER);
        standaloneReverseRegistrar = new TestableStandaloneReverseRegistrar();
        vm.stopPrank();
    }

    function testSupportsInterface() public view {
        // Check ERC165 support
        assertTrue(
            standaloneReverseRegistrar.supportsInterface(0x01ffc9a7),
            "Should support ERC165"
        );

        // Check IStandaloneReverseRegistrar support
        assertTrue(
            standaloneReverseRegistrar.supportsInterface(
                type(IStandaloneReverseRegistrar).interfaceId
            ),
            "Should support IStandaloneReverseRegistrar"
        );

        // Check that it doesn't support random interfaces
        assertFalse(
            standaloneReverseRegistrar.supportsInterface(0x12345678),
            "Should not support random interface"
        );
    }

    function testNameForAddrInitiallyEmpty() public view {
        // All addresses should initially return empty names
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            "",
            "Should return empty name initially"
        );
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER2),
            "",
            "Should return empty name initially"
        );
        assertEq(
            standaloneReverseRegistrar.nameForAddr(address(0)),
            "",
            "Should return empty name for zero address"
        );
    }

    function testSetNameForOwner() public {
        vm.startPrank(OWNER);

        // Expect event emission
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(OWNER, TEST_NAME_1);

        // Set name for owner
        standaloneReverseRegistrar.setName(OWNER, TEST_NAME_1);

        // Verify name was set
        assertEq(
            standaloneReverseRegistrar.nameForAddr(OWNER),
            TEST_NAME_1,
            "Should return set name for owner"
        );

        vm.stopPrank();
    }

    function testSetNameForDifferentAddress() public {
        vm.startPrank(OWNER);

        // Expect event emission
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER1, TEST_NAME_1);

        // Owner can set name for any address
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);

        // Verify name was set
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            TEST_NAME_1,
            "Should return set name for user1"
        );

        vm.stopPrank();
    }

    function testUpdateExistingName() public {
        vm.startPrank(OWNER);

        // Set initial name
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            TEST_NAME_1,
            "Should have initial name"
        );

        // Expect event emission for update
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER1, TEST_NAME_2);

        // Update name
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_2);

        // Verify name was updated
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            TEST_NAME_2,
            "Should return updated name"
        );

        vm.stopPrank();
    }

    function testClearName() public {
        vm.startPrank(OWNER);

        // Set initial name
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            TEST_NAME_1,
            "Should have initial name"
        );

        // Expect event emission for clearing
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER1, EMPTY_NAME);

        // Clear name by setting empty string
        standaloneReverseRegistrar.setNameForAddress(USER1, EMPTY_NAME);

        // Verify name was cleared
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            EMPTY_NAME,
            "Should return empty name after clearing"
        );

        vm.stopPrank();
    }

    function testUnauthorizedCannotSetName() public {
        vm.startPrank(UNAUTHORIZED);

        // Should revert when unauthorized user tries to set name
        vm.expectRevert("Not authorized");
        standaloneReverseRegistrar.setName(UNAUTHORIZED, TEST_NAME_1);

        vm.expectRevert("Not authorized");
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);

        vm.stopPrank();
    }

    function testMultipleAddressesIndependent() public {
        vm.startPrank(OWNER);

        // Set different names for different addresses
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);
        standaloneReverseRegistrar.setNameForAddress(USER2, TEST_NAME_2);

        // Verify each address has its own name
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            TEST_NAME_1,
            "USER1 should have TEST_NAME_1"
        );
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER2),
            TEST_NAME_2,
            "USER2 should have TEST_NAME_2"
        );

        // Verify clearing one doesn't affect the other
        standaloneReverseRegistrar.setNameForAddress(USER1, EMPTY_NAME);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            EMPTY_NAME,
            "USER1 name should be cleared"
        );
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER2),
            TEST_NAME_2,
            "USER2 name should remain unchanged"
        );

        vm.stopPrank();
    }

    function testOwnershipTransfer() public {
        vm.startPrank(OWNER);

        // Transfer ownership to USER1
        standaloneReverseRegistrar.transferOwnership(USER1);

        vm.stopPrank();

        // Original owner should no longer be able to set names
        vm.startPrank(OWNER);
        vm.expectRevert("Not authorized");
        standaloneReverseRegistrar.setName(OWNER, TEST_NAME_1);
        vm.stopPrank();

        // New owner should be able to set names
        vm.startPrank(USER1);
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            TEST_NAME_1,
            "New owner should be able to set names"
        );
        vm.stopPrank();
    }

    function testEventEmission() public {
        vm.startPrank(OWNER);

        // Test event is emitted with correct parameters
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER1, TEST_NAME_1);
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);

        // Test event for name update
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER1, TEST_NAME_2);
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_2);

        // Test event for clearing name
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER1, "");
        standaloneReverseRegistrar.setNameForAddress(USER1, "");

        vm.stopPrank();
    }

    function testLongNameSupport() public {
        vm.startPrank(OWNER);

        // Test with a very long name
        string
            memory longName = "verylongnametestverylongnametestverylongnametestverylongnametestverylongnametestverylongnametestverylongnametest.eth";

        standaloneReverseRegistrar.setNameForAddress(USER1, longName);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            longName,
            "Should handle long names"
        );

        vm.stopPrank();
    }

    function testSpecialCharactersInName() public {
        vm.startPrank(OWNER);

        // Test with special characters
        string memory specialName = "test-name_123.eth";

        standaloneReverseRegistrar.setNameForAddress(USER1, specialName);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(USER1),
            specialName,
            "Should handle special characters"
        );

        vm.stopPrank();
    }

    function testZeroAddressHandling() public {
        vm.startPrank(OWNER);

        // Should be able to set name for zero address
        standaloneReverseRegistrar.setNameForAddress(address(0), TEST_NAME_1);
        assertEq(
            standaloneReverseRegistrar.nameForAddr(address(0)),
            TEST_NAME_1,
            "Should handle zero address"
        );

        vm.stopPrank();
    }

    function testNameForAddrView() public {
        // nameForAddr should be a view function and not modify state
        vm.startPrank(OWNER);
        standaloneReverseRegistrar.setNameForAddress(USER1, TEST_NAME_1);
        vm.stopPrank();

        // Reading the name multiple times should return the same result
        string memory name1 = standaloneReverseRegistrar.nameForAddr(USER1);
        string memory name2 = standaloneReverseRegistrar.nameForAddr(USER1);

        assertEq(
            name1,
            name2,
            "Multiple reads should return consistent results"
        );
        assertEq(name1, TEST_NAME_1, "Should return the correct name");
    }

    function testContractInterfaceId() public pure {
        // Verify the interface ID is calculated correctly
        bytes4 expectedInterfaceId = type(IStandaloneReverseRegistrar)
            .interfaceId;
        bytes4 calculatedInterfaceId = bytes4(
            keccak256("nameForAddr(address)")
        );

        assertEq(
            expectedInterfaceId,
            calculatedInterfaceId,
            "Interface ID should match expected value"
        );
    }
}
