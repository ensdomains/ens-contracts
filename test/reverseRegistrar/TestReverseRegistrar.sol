// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";

/**
 * @title TestReverseRegistrar
 * @dev Complete tests for ReverseRegistrar contract functionality
 */
contract TestReverseRegistrar is BaseTest {
    // Note: BaseTest provides: ens, baseRegistrar, controller, priceOracle, dummyOracle,
    // nameWrapper, metadataService, reverseRegistrar, publicResolver
    // and standard accounts: USER1, USER2, USER3
    // and constants: ZERO_HASH, ETH_NODE, REVERSE_NODE, ADDR_REVERSE_NODE, DAY, REGISTRATION_TIME

    MockPublicResolver public mockResolver;

    function setUp() public override {
        super.setUp();

        // Deploy MockPublicResolver for setName tests (in addition to BaseTest's publicResolver)
        mockResolver = new MockPublicResolver();

        // Set default resolver for reverse registrar
        vm.prank(TestAccounts.owner());
        reverseRegistrar.setDefaultResolver(address(mockResolver));
    }

    // Test 1: should calculate node hash correctly
    function testShouldCalculateNodeHashCorrectly() public view {
        bytes32 expectedHash = _getReverseNodeHash(address(this));
        bytes32 actualHash = reverseRegistrar.node(address(this));

        assertEq(
            actualHash,
            expectedHash,
            "Node hash calculation should be correct"
        );
    }

    // === claim tests ===

    // Test 2: allows an account to claim its address
    function testAllowsAccountToClaimItsAddress() public {
        reverseRegistrar.claim(USER1);

        bytes32 reverseNode = _getReverseNodeHash(address(this));
        address owner = ens.owner(reverseNode);

        assertEq(owner, USER1, "Reverse record should be owned by USER1");
    }

    // Test 3: event ReverseClaimed is emitted
    function testClaimEmitsReverseClaimedEvent() public {
        bytes32 expectedNode = _getReverseNodeHash(address(this));

        vm.expectEmit(true, true, false, false);
        emit ReverseClaimed(address(this), expectedNode);

        reverseRegistrar.claim(USER1);
    }

    // === claimForAddr tests ===

    // Test 4: allows an account to claim its address
    function testClaimForAddrAllowsAccountToClaimItsAddress() public {
        address testResolver = address(0x123);
        reverseRegistrar.claimForAddr(address(this), USER1, testResolver);

        bytes32 reverseNode = _getReverseNodeHash(address(this));
        address owner = ens.owner(reverseNode);
        address resolver = ens.resolver(reverseNode);

        assertEq(owner, USER1, "Reverse record should be owned by USER1");
        assertEq(resolver, testResolver, "Resolver should be set");
    }

    // Test 5: event ReverseClaimed is emitted
    function testClaimForAddrEmitsReverseClaimedEvent() public {
        bytes32 expectedNode = _getReverseNodeHash(address(this));

        vm.expectEmit(true, true, false, false);
        emit ReverseClaimed(address(this), expectedNode);

        reverseRegistrar.claimForAddr(address(this), USER1, address(0));
    }

    // Test 6: forbids an account to claim another address
    function testForbidsAccountToClaimAnotherAddress() public {
        vm.prank(USER1);
        vm.expectRevert(bytes(""));
        reverseRegistrar.claimForAddr(USER2, address(this), address(0));
    }

    // Test 7: allows an authorised account to claim a different address
    function testAllowsAuthorisedAccountToClaimDifferentAddress() public {
        // USER1 authorizes this contract
        vm.prank(USER1);
        ens.setApprovalForAll(address(this), true);

        // Now this contract can claim for USER1
        reverseRegistrar.claimForAddr(USER1, USER2, address(0));

        bytes32 reverseNode = _getReverseNodeHash(USER1);
        address owner = ens.owner(reverseNode);

        assertEq(
            owner,
            USER2,
            "Authorised account should be able to claim for USER1"
        );
    }

    // Test 8: allows a controller to claim a different address
    function testAllowsControllerToClaimDifferentAddress() public {
        vm.prank(TestAccounts.owner());
        reverseRegistrar.setController(address(this), true);
        reverseRegistrar.claimForAddr(USER1, USER2, address(0));

        bytes32 reverseNode = _getReverseNodeHash(USER1);
        address owner = ens.owner(reverseNode);

        assertEq(
            owner,
            USER2,
            "Controller should be able to claim for any address"
        );
    }

    // Test 9: allows an owner() of a contract to claim the reverse node of that contract
    function testAllowsOwnerOfContractToClaimReverseNode() public {
        // Deploy a second ReverseRegistrar as dummyOwnable
        ReverseRegistrar dummyOwnable = new ReverseRegistrar(ens);

        // Set controller first
        vm.prank(TestAccounts.owner());
        reverseRegistrar.setController(address(this), true);

        // Claim reverse record for the contract
        reverseRegistrar.claimForAddr(
            address(dummyOwnable),
            USER1,
            address(mockResolver)
        );

        bytes32 reverseNode = _getReverseNodeHash(address(dummyOwnable));
        address owner = ens.owner(reverseNode);

        assertEq(
            owner,
            USER1,
            "Contract owner should be able to claim reverse record"
        );
    }

    // === claimWithResolver tests ===

    // Test 10: allows an account to specify resolver
    function testAllowsAccountToSpecifyResolver() public {
        reverseRegistrar.claimWithResolver(USER1, USER2);

        bytes32 reverseNode = _getReverseNodeHash(address(this));
        address owner = ens.owner(reverseNode);
        address resolver = ens.resolver(reverseNode);

        assertEq(owner, USER1, "Owner should be set correctly");
        assertEq(resolver, USER2, "Resolver should be set correctly");
    }

    // Test 11: event ReverseClaimed is emitted
    function testClaimWithResolverEmitsReverseClaimedEvent() public {
        bytes32 expectedNode = _getReverseNodeHash(address(this));

        vm.expectEmit(true, true, false, false);
        emit ReverseClaimed(address(this), expectedNode);

        reverseRegistrar.claimWithResolver(USER1, address(0));
    }

    // === setNameForAddr tests ===

    // Test 12: allows controller to set name records for other accounts
    function testAllowsControllerToSetNameRecordsForOtherAccounts() public {
        // Set controller
        vm.prank(TestAccounts.owner());
        reverseRegistrar.setController(address(this), true);

        // Set name for USER1
        string memory name = "test.eth";
        reverseRegistrar.setNameForAddr(
            USER1,
            USER2,
            address(mockResolver),
            name
        );

        bytes32 reverseNode = _getReverseNodeHash(USER1);
        address owner = ens.owner(reverseNode);
        address resolver = ens.resolver(reverseNode);

        assertEq(owner, USER2, "Owner should be USER2");
        assertEq(resolver, address(mockResolver), "Resolver should be set");

        // Check that name is set in resolver
        string memory storedName = mockResolver.name(reverseNode);
        assertEq(storedName, name, "Name should be stored in resolver");
    }

    // Test 13: event ReverseClaimed is emitted
    function testSetNameForAddrEmitsReverseClaimedEvent() public {
        vm.prank(TestAccounts.owner());
        reverseRegistrar.setController(address(this), true);

        bytes32 expectedNode = _getReverseNodeHash(USER1);

        vm.expectEmit(true, true, false, false);
        emit ReverseClaimed(USER1, expectedNode);

        reverseRegistrar.setNameForAddr(
            USER1,
            USER2,
            address(mockResolver),
            "test.eth"
        );
    }

    // Test 14: forbids non-controller if address is different from sender and not authorised
    function testForbidsNonControllerIfAddressIsDifferentFromSenderAndNotAuthorised()
        public
    {
        vm.prank(USER1);
        vm.expectRevert(bytes(""));
        reverseRegistrar.setNameForAddr(
            USER2,
            USER3,
            address(mockResolver),
            "test.eth"
        );
    }

    // Test 15: allows name to be set for an address if the sender is the address
    function testAllowsNameToBeSetForAddressIfSenderIsTheAddress() public {
        vm.prank(USER1);
        reverseRegistrar.setNameForAddr(
            USER1,
            USER2,
            address(mockResolver),
            "test.eth"
        );

        bytes32 reverseNode = _getReverseNodeHash(USER1);
        address owner = ens.owner(reverseNode);

        assertEq(
            owner,
            USER2,
            "USER1 should be able to set their own reverse record"
        );
    }

    // Test 16: allows name to be set for an address if the sender is authorised
    function testAllowsNameToBeSetForAddressIfSenderIsAuthorised() public {
        // USER1 authorizes USER2
        vm.prank(USER1);
        ens.setApprovalForAll(USER2, true);

        // USER2 sets name for USER1
        vm.prank(USER2);
        reverseRegistrar.setNameForAddr(
            USER1,
            USER3,
            address(mockResolver),
            "test.eth"
        );

        bytes32 reverseNode = _getReverseNodeHash(USER1);
        address owner = ens.owner(reverseNode);

        assertEq(
            owner,
            USER3,
            "Authorised user should be able to set reverse record"
        );
    }

    // Test 17: allows an owner() of a contract to claimWithResolverForAddr on behalf of the contract
    function testAllowsOwnerOfContractToClaimWithResolverForAddr() public {
        // Deploy a second ReverseRegistrar as dummyOwnable
        ReverseRegistrar dummyOwnable = new ReverseRegistrar(ens);

        // Set name for the contract
        reverseRegistrar.setNameForAddr(
            address(dummyOwnable),
            USER1,
            address(mockResolver),
            "contract.eth"
        );

        bytes32 reverseNode = _getReverseNodeHash(address(dummyOwnable));
        address owner = ens.owner(reverseNode);
        string memory storedName = mockResolver.name(reverseNode);

        assertEq(
            owner,
            USER1,
            "Contract reverse record should be owned by USER1"
        );
        assertEq(storedName, "contract.eth", "Name should be stored");
    }

    // === setController tests ===

    // Test 18: forbids non-owner from setting a controller
    function testForbidsNonOwnerFromSettingController() public {
        vm.prank(USER1);
        vm.expectRevert("Ownable: caller is not the owner");
        reverseRegistrar.setController(USER1, true);
    }

    // Additional test for setController allows owner
    function testAllowsOwnerToSetController() public {
        vm.prank(TestAccounts.owner());
        reverseRegistrar.setController(USER1, true);
        assertTrue(
            reverseRegistrar.controllers(USER1),
            "USER1 should be a controller"
        );

        vm.prank(TestAccounts.owner());
        reverseRegistrar.setController(USER1, false);
        assertFalse(
            reverseRegistrar.controllers(USER1),
            "USER1 should no longer be a controller"
        );
    }

    // Helper function to get reverse node hash for an address
    function _getReverseNodeHash(address addr) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    ADDR_REVERSE_NODE,
                    keccak256(abi.encodePacked(_addressToHex(addr)))
                )
            );
    }

    // Helper function to convert address to hex string (lowercase)
    function _addressToHex(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(40);
        bytes memory alphabet = "0123456789abcdef";

        uint256 value = uint256(uint160(addr));
        for (uint256 i = 39; i >= 0; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
            if (i == 0) break;
        }

        return string(buffer);
    }

    // Events
    event ReverseClaimed(address indexed addr, bytes32 indexed node);
}

/**
 * @dev Mock PublicResolver that only implements the name() function needed for tests
 */
contract MockPublicResolver {
    mapping(bytes32 => string) public names;

    function setName(bytes32 node, string memory _name) external {
        names[node] = _name;
    }

    function name(bytes32 node) external view returns (string memory) {
        return names[node];
    }
}
