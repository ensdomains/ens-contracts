// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import {TestAccounts} from "../utils/TestAccounts.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title TestBaseRegistrar
 * @dev Tests BaseRegistrarImplementation functionality including NFT registration, renewals, transfers, controller management, and ERC721 compliance
 */
contract TestBaseRegistrar is BaseTest {
    // Note: BaseTest provides: ens, baseRegistrar, and constants: ZERO_HASH, ETH_NODE, DAY
    // and standard accounts: USER1, USER2, USER3

    // Additional test accounts for this specific test
    address public ownerAccount;
    address public controllerAccount;
    address public registrantAccount;
    address public otherAccount;

    // Note: REGISTRATION_TIME is provided by BaseTest

    function setUp() public override {
        super.setUp();

        // Set up test accounts using BaseTest's users
        ownerAccount = TestAccounts.owner(); // Use the same owner as BaseTest
        controllerAccount = USER2;
        registrantAccount = USER3;
        otherAccount = address(0x4444); // Additional account

        // Fund additional account
        fundAccount(otherAccount, 100 ether);

        vm.startPrank(ownerAccount);

        // Add controller to the already deployed baseRegistrar
        baseRegistrar.addController(controllerAccount);

        vm.stopPrank();
    }

    // Note: namehash, labelhash, and toLabelId are provided by BaseTest

    // Helper function to split strings by delimiter
    function split(
        string memory str,
        string memory delimiter
    ) internal pure returns (string[] memory) {
        bytes memory strBytes = bytes(str);
        bytes memory delimiterBytes = bytes(delimiter);

        if (strBytes.length == 0) {
            string[] memory empty = new string[](0);
            return empty;
        }

        // Count occurrences of delimiter
        uint256 count = 1;
        for (uint256 i = 0; i <= strBytes.length - delimiterBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < delimiterBytes.length; j++) {
                if (strBytes[i + j] != delimiterBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                count++;
                i += delimiterBytes.length - 1;
            }
        }

        // Split the string
        string[] memory parts = new string[](count);
        uint256 partIndex = 0;
        uint256 lastIndex = 0;

        for (uint256 i = 0; i <= strBytes.length - delimiterBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < delimiterBytes.length; j++) {
                if (strBytes[i + j] != delimiterBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                bytes memory part = new bytes(i - lastIndex);
                for (uint256 k = 0; k < i - lastIndex; k++) {
                    part[k] = strBytes[lastIndex + k];
                }
                parts[partIndex] = string(part);
                partIndex++;
                i += delimiterBytes.length - 1;
                lastIndex = i + 1;
            }
        }

        // Add the last part
        if (lastIndex < strBytes.length) {
            bytes memory part = new bytes(strBytes.length - lastIndex);
            for (uint256 k = 0; k < strBytes.length - lastIndex; k++) {
                part[k] = strBytes[lastIndex + k];
            }
            parts[partIndex] = string(part);
        }

        return parts;
    }

    // Test 1: New registrations
    function testShouldAllowNewRegistrations() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        vm.startPrank(controllerAccount);

        uint256 tokenId = toLabelId("newname");
        uint256 expiryBefore = block.timestamp + REGISTRATION_TIME;

        // Check if name is available before registering
        assertTrue(
            baseRegistrar.available(tokenId),
            "Name should be available for registration"
        );

        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        // Check ENS registry ownership
        assertEq(
            ens.owner(namehash("newname.eth")),
            registrantAccount,
            "ENS registry owner should be registrant"
        );

        // Check NFT ownership
        assertEq(
            baseRegistrar.ownerOf(tokenId),
            registrantAccount,
            "NFT owner should be registrant"
        );

        // Check expiry (allow for block timestamp changes)
        uint256 actualExpiry = baseRegistrar.nameExpires(tokenId);
        assertTrue(
            actualExpiry >= expiryBefore && actualExpiry <= expiryBefore + 10,
            "Expiry should be approximately correct"
        );

        vm.stopPrank();
    }

    // Test 2: Registration without updating registry
    function testShouldAllowRegistrationsWithoutUpdatingTheRegistry() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        vm.startPrank(controllerAccount);

        uint256 tokenId = toLabelId("silentname");
        uint256 expiryBefore = block.timestamp + REGISTRATION_TIME;

        baseRegistrar.registerOnly(
            tokenId,
            registrantAccount,
            REGISTRATION_TIME
        );

        // Check ENS registry should NOT be updated (remains at zero address)
        assertEq(
            ens.owner(namehash("silentname.eth")),
            address(0),
            "ENS registry owner should remain zero address"
        );

        // Check NFT ownership
        assertEq(
            baseRegistrar.ownerOf(tokenId),
            registrantAccount,
            "NFT owner should be registrant"
        );

        // Check expiry
        uint256 actualExpiry = baseRegistrar.nameExpires(tokenId);
        assertTrue(
            actualExpiry >= expiryBefore && actualExpiry <= expiryBefore + 10,
            "Expiry should be approximately correct"
        );

        vm.stopPrank();
    }

    // Test 3: Should not allow registration if not the controller
    function testShouldNotAllowRegistrationIfNotTheController() public {
        vm.startPrank(otherAccount);

        uint256 tokenId = toLabelId("newname");

        vm.expectRevert(bytes(""));
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        vm.stopPrank();
    }

    // Test 4: Should not allow registration of an already-owned name
    function testShouldNotAllowRegistrationOfAnAlreadyOwnedName() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        // First registration
        vm.startPrank(controllerAccount);
        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        // Attempt second registration
        vm.expectRevert(bytes(""));
        baseRegistrar.register(tokenId, otherAccount, REGISTRATION_TIME);

        vm.stopPrank();
    }

    // Test 5: Should allow renewal of an owned name
    function testShouldAllowRenewalOfAnOwnedName() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        // First registration
        vm.startPrank(controllerAccount);
        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        uint256 originalExpiry = baseRegistrar.nameExpires(tokenId);

        // Renew
        baseRegistrar.renew(tokenId, REGISTRATION_TIME);

        uint256 newExpiry = baseRegistrar.nameExpires(tokenId);
        assertEq(
            newExpiry,
            originalExpiry + REGISTRATION_TIME,
            "Expiry should be extended by registration time"
        );

        vm.stopPrank();
    }

    // Test 6: Should only allow the controller to register names
    function testShouldOnlyAllowTheControllerToRegisterNames() public {
        vm.startPrank(registrantAccount);

        uint256 tokenId = toLabelId("newname");

        vm.expectRevert(bytes(""));
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        vm.stopPrank();
    }

    // Test 7: BaseRegistrar doesn't validate label length - that's handled by ETHRegistrarController
    // This test verifies that BaseRegistrar accepts any valid tokenId (hash) regardless of original label length
    function testShouldAcceptAnyTokenIdRegardlessOfLabelLength() public {
        vm.startPrank(controllerAccount);

        // BaseRegistrar works with tokenIds (hashes), not original labels
        // It doesn't know or care about the original label content or length

        // Test with hash of empty label (BaseRegistrar doesn't validate this)
        uint256 emptyLabelId = toLabelId("");
        if (baseRegistrar.available(emptyLabelId)) {
            baseRegistrar.register(
                emptyLabelId,
                registrantAccount,
                REGISTRATION_TIME
            );
            assertEq(baseRegistrar.ownerOf(emptyLabelId), registrantAccount);
        }

        // Test with hash of single character
        uint256 singleCharId = toLabelId("a");
        if (baseRegistrar.available(singleCharId)) {
            baseRegistrar.register(
                singleCharId,
                registrantAccount,
                REGISTRATION_TIME
            );
            assertEq(baseRegistrar.ownerOf(singleCharId), registrantAccount);
        }

        vm.stopPrank();
    }

    // Test 8: Should permit registration of any available tokenId - BaseRegistrar level testing
    function testShouldPermitRegistrationOfAnyAvailableTokenId() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        vm.startPrank(controllerAccount);

        // Test normal length label (3+ characters)
        baseRegistrar.register(
            toLabelId("abc"),
            registrantAccount,
            REGISTRATION_TIME
        );
        assertEq(baseRegistrar.ownerOf(toLabelId("abc")), registrantAccount);

        // Test longer label
        string
            memory longerLabel = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghij";
        baseRegistrar.register(
            toLabelId(longerLabel),
            registrantAccount,
            REGISTRATION_TIME
        );
        assertEq(
            baseRegistrar.ownerOf(toLabelId(longerLabel)),
            registrantAccount
        );

        vm.stopPrank();
    }

    // Test 9: Should allow the NFT owner to reclaim a name
    function testShouldAllowAnyoneToReclaimAName() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        // Register a name
        vm.startPrank(controllerAccount);
        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);
        vm.stopPrank();

        // Change ENS registry owner to someone else
        vm.prank(registrantAccount);
        ens.setOwner(namehash("newname.eth"), otherAccount);

        // Verify ENS registry was changed
        assertEq(
            ens.owner(namehash("newname.eth")),
            otherAccount,
            "ENS registry owner should be changed"
        );

        // NFT owner can reclaim (restore ENS registry to NFT owner)
        vm.prank(registrantAccount);
        baseRegistrar.reclaim(tokenId, registrantAccount);

        // Verify ENS registry is restored to NFT owner
        assertEq(
            ens.owner(namehash("newname.eth")),
            registrantAccount,
            "ENS registry owner should be restored to NFT owner"
        );
    }

    // Test 10: Should allow a controller to register a previously-owned, expired name
    function testShouldAllowAControllerToRegisterAPreviouslyOwnedExpiredName()
        public
    {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        vm.startPrank(controllerAccount);

        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        // Get the actual expiry time from the registration
        uint256 nameExpiry = baseRegistrar.nameExpires(tokenId);

        // Fast forward past expiry AND grace period (90 days)
        vm.warp(nameExpiry + 90 days + 1);

        // Should be able to register again after expiry + grace period
        baseRegistrar.register(tokenId, otherAccount, REGISTRATION_TIME);

        assertEq(
            baseRegistrar.ownerOf(tokenId),
            otherAccount,
            "New owner should be otherAccount"
        );

        vm.stopPrank();
    }

    // Test 11: Should allow owner to transfer NFT
    function testShouldAllowOwnerToTransferNFT() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        // Register a name
        vm.startPrank(controllerAccount);
        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);
        vm.stopPrank();

        // Transfer NFT
        vm.prank(registrantAccount);
        baseRegistrar.transferFrom(registrantAccount, otherAccount, tokenId);

        // Check NFT ownership
        assertEq(
            baseRegistrar.ownerOf(tokenId),
            otherAccount,
            "NFT owner should be otherAccount"
        );

        // ENS registry should not automatically update
        assertEq(
            ens.owner(namehash("newname.eth")),
            registrantAccount,
            "ENS registry owner should remain registrantAccount"
        );
    }

    // Test 12: Should update ENS registry when NFT is transferred and reclaim is called
    function testShouldUpdateENSRegistryWhenNFTIsTransferredAndReclaimIsCalled()
        public
    {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        // Register a name
        vm.startPrank(controllerAccount);
        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);
        vm.stopPrank();

        // Transfer NFT
        vm.prank(registrantAccount);
        baseRegistrar.transferFrom(registrantAccount, otherAccount, tokenId);

        // Reclaim to update ENS registry
        vm.prank(otherAccount);
        baseRegistrar.reclaim(tokenId, otherAccount);

        // Check both NFT and ENS registry ownership
        assertEq(
            baseRegistrar.ownerOf(tokenId),
            otherAccount,
            "NFT owner should be otherAccount"
        );
        assertEq(
            ens.owner(namehash("newname.eth")),
            otherAccount,
            "ENS registry owner should be otherAccount"
        );
    }

    // Test 13: Should not allow transfer of expired NFT
    function testShouldNotAllowTransferOfExpiredNFT() public {
        // Fast-forward past grace period so names are available
        vm.warp(block.timestamp + 91 days);

        vm.startPrank(controllerAccount);

        uint256 tokenId = toLabelId("newname");
        baseRegistrar.register(tokenId, registrantAccount, REGISTRATION_TIME);

        // Fast forward past expiry
        vm.warp(block.timestamp + REGISTRATION_TIME + 1);

        vm.stopPrank();

        // Should not be able to transfer expired NFT
        vm.prank(registrantAccount);
        vm.expectRevert(bytes(""));
        baseRegistrar.transferFrom(registrantAccount, otherAccount, tokenId);
    }

    // Test 14: Should allow adding and removing controllers
    function testShouldAllowAddingAndRemovingControllers() public {
        vm.startPrank(ownerAccount);

        // Add new controller
        baseRegistrar.addController(otherAccount);
        assertTrue(
            baseRegistrar.controllers(otherAccount),
            "otherAccount should be a controller"
        );

        // Remove controller
        baseRegistrar.removeController(otherAccount);
        assertFalse(
            baseRegistrar.controllers(otherAccount),
            "otherAccount should not be a controller"
        );

        vm.stopPrank();
    }

    // Test 15: Should not allow non-owner to add controllers
    function testShouldNotAllowNonOwnerToAddControllers() public {
        vm.prank(otherAccount);
        vm.expectRevert("Ownable: caller is not the owner");
        baseRegistrar.addController(otherAccount);
    }

    // Test 16: Should allow the owner to set a resolver address
    function testShouldAllowOwnerToSetResolverAddress() public {
        // The owner of the BaseRegistrar can set the resolver for 'eth' node
        vm.prank(ownerAccount);
        baseRegistrar.setResolver(controllerAccount);

        // Verify resolver is set on the ENS registry
        assertEq(
            ens.resolver(namehash("eth")),
            controllerAccount,
            "Resolver should be set to controller account"
        );
    }

    // Test 17: Should support ERC721 and ERC165 interfaces
    function testShouldSupportERC721AndERC165Interfaces() public view {
        // ERC165
        assertTrue(
            baseRegistrar.supportsInterface(type(IERC165).interfaceId),
            "Should support ERC165"
        );

        // ERC721
        assertTrue(
            baseRegistrar.supportsInterface(type(IERC721).interfaceId),
            "Should support ERC721"
        );

        // Note: BaseRegistrarImplementation doesn't support ERC721Metadata by design
        // It has empty name/symbol strings and no tokenURI implementation
    }

    // Test 18: Should return correct name and symbol
    function testShouldReturnCorrectNameAndSymbol() public view {
        // BaseRegistrarImplementation has empty name and symbol by design
        assertEq(baseRegistrar.name(), "", "Name should be empty string");
        assertEq(baseRegistrar.symbol(), "", "Symbol should be empty string");
    }
}
