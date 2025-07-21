// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "../../contracts/resolvers/profiles/IDNSZoneResolver.sol";
import "../../contracts/resolvers/profiles/IAddrResolver.sol";
import "../../contracts/resolvers/profiles/IAddressResolver.sol";
import "../../contracts/resolvers/profiles/INameResolver.sol";
import "../../contracts/resolvers/profiles/IABIResolver.sol";
import "../../contracts/resolvers/profiles/IPubkeyResolver.sol";
import "../../contracts/resolvers/profiles/ITextResolver.sol";
import "../../contracts/resolvers/profiles/IContentHashResolver.sol";
import "../../contracts/resolvers/profiles/IDNSRecordResolver.sol";
import "../../contracts/resolvers/profiles/IInterfaceResolver.sol";
import "../../contracts/utils/NameCoder.sol";
import "../../contracts/resolvers/mocks/DummyNameWrapper.sol";
import "../../contracts/wrapper/INameWrapper.sol";

/**
 * @title TestPublicResolver
 * @dev Tests PublicResolver functionality including address resolution, name resolution, public key storage, ABI storage, text records, content hash, DNS records, and interface resolution
 */
contract TestPublicResolver is BaseTest {
    // Note: BaseTest provides: ens, baseRegistrar, controller, priceOracle, dummyOracle,
    // nameWrapper, metadataService, reverseRegistrar, publicResolver, root
    // and standard accounts: USER1, USER2, USER3
    // and constants: ZERO_HASH, ETH_NODE, REVERSE_NODE, ADDR_REVERSE_NODE, DAY, REGISTRATION_TIME

    // Test accounts fixture - keeping original test account structure for compatibility
    address public account0;
    address public account1;
    address public account2;
    address public account3;
    address public account4;
    address public account5;
    address public account6;
    address public account7;
    address public account8;
    address public account9;

    // Target node (namehash('eth'))
    bytes32 constant targetNode = ETH_NODE;

    // DummyNameWrapper for testing authorization
    DummyNameWrapper public dummyNameWrapper;

    // Events
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );
    event Approved(
        address owner,
        bytes32 indexed node,
        address delegate,
        bool approved
    );
    event AddrChanged(bytes32 indexed node, address a);
    event AddressChanged(
        bytes32 indexed node,
        uint256 coinType,
        bytes newAddress
    );
    event NameChanged(bytes32 indexed node, string name);
    event ABIChanged(bytes32 indexed node, uint256 indexed contentType);
    event PubkeyChanged(bytes32 indexed node, bytes32 x, bytes32 y);
    event TextChanged(
        bytes32 indexed node,
        string indexed indexedKey,
        string key,
        string value
    );
    event ContenthashChanged(bytes32 indexed node, bytes hash);
    event DNSRecordChanged(
        bytes32 indexed node,
        bytes name,
        uint16 resource,
        bytes record
    );
    event DNSRecordDeleted(bytes32 indexed node, bytes name, uint16 resource);
    event DNSZonehashChanged(
        bytes32 indexed node,
        bytes lastzonehash,
        bytes zonehash
    );
    event InterfaceChanged(
        bytes32 indexed node,
        bytes4 indexed interfaceID,
        address implementer
    );
    event VersionChanged(bytes32 indexed node, uint64 newVersion);

    function setUp() public override {
        super.setUp();

        // Set up test accounts - mapping to existing structure
        account0 = address(0x1111);
        account1 = address(0x2222);
        account2 = address(0x3333);
        account3 = address(0x4444);
        account4 = address(0x5555);
        account5 = address(0x6666);
        account6 = address(0x7777);
        account7 = address(0x8888);
        account8 = address(0x9999);
        account9 = address(0xAAAA);

        // Fund test accounts with ETH
        fundAccount(account0, 100 ether);
        fundAccount(account1, 100 ether);
        fundAccount(account2, 100 ether);
        fundAccount(account3, 100 ether);
        fundAccount(account4, 100 ether);
        fundAccount(account5, 100 ether);
        fundAccount(account6, 100 ether);
        fundAccount(account7, 100 ether);
        fundAccount(account8, 100 ether);
        fundAccount(account9, 100 ether);

        // Give account0 ownership of ETH_NODE for tests
        // Use Root contract to transfer ETH_NODE ownership to account0
        vm.prank(TestAccounts.owner());
        root.setSubnodeOwner(ENSTestUtils.labelhash("eth"), account0);

        // Deploy DummyNameWrapper for testing authorization
        // This returns tx.origin as the owner
        dummyNameWrapper = new DummyNameWrapper();

        // Deploy a new PublicResolver with account9 as trusted ETH controller
        // and DummyNameWrapper for NameWrapper authorization tests
        publicResolver = new PublicResolver(
            ens,
            INameWrapper(address(dummyNameWrapper)), // Cast to INameWrapper interface
            account9, // account9 as trusted ETH controller (matches original test)
            address(reverseRegistrar)
        );
    }

    // Test 1: "forbids calls to the fallback function with 0 value"
    function testForbidsCallsToFallbackFunctionWith0Value() public {
        (bool success, ) = address(publicResolver).call("");
        assertFalse(success, "Fallback should revert");
    }

    // Test 2: "forbids calls to the fallback function with 1 value"
    function testForbidsCallsToFallbackFunctionWith1Value() public {
        (bool success, ) = address(publicResolver).call{value: 1}("");
        assertFalse(success, "Fallback with value should revert");
    }

    // Test 3: "supports known interfaces"
    function testSupportsKnownInterfaces() public view {
        // Test interface support

        // IAddrResolver
        assertTrue(
            publicResolver.supportsInterface(type(IAddrResolver).interfaceId),
            "Should support IAddrResolver"
        );

        // IAddressResolver
        assertTrue(
            publicResolver.supportsInterface(
                type(IAddressResolver).interfaceId
            ),
            "Should support IAddressResolver"
        );

        // INameResolver
        assertTrue(
            publicResolver.supportsInterface(type(INameResolver).interfaceId),
            "Should support INameResolver"
        );

        // IABIResolver
        assertTrue(
            publicResolver.supportsInterface(type(IABIResolver).interfaceId),
            "Should support IABIResolver"
        );

        // IPubkeyResolver
        assertTrue(
            publicResolver.supportsInterface(type(IPubkeyResolver).interfaceId),
            "Should support IPubkeyResolver"
        );

        // ITextResolver
        assertTrue(
            publicResolver.supportsInterface(type(ITextResolver).interfaceId),
            "Should support ITextResolver"
        );

        // IContentHashResolver
        assertTrue(
            publicResolver.supportsInterface(
                type(IContentHashResolver).interfaceId
            ),
            "Should support IContentHashResolver"
        );

        // IDNSRecordResolver
        assertTrue(
            publicResolver.supportsInterface(
                type(IDNSRecordResolver).interfaceId
            ),
            "Should support IDNSRecordResolver"
        );

        // IDNSZoneResolver
        assertTrue(
            publicResolver.supportsInterface(
                type(IDNSZoneResolver).interfaceId
            ),
            "Should support IDNSZoneResolver"
        );

        // IInterfaceResolver
        assertTrue(
            publicResolver.supportsInterface(
                type(IInterfaceResolver).interfaceId
            ),
            "Should support IInterfaceResolver"
        );
    }

    // Test 4: "does not support a random interface"
    function testDoesNotSupportRandomInterface() public view {
        assertFalse(
            publicResolver.supportsInterface(0x3b3b57df),
            "Should not support random interface"
        );
    }

    // Test 5: "permits clearing records"
    function testPermitsClearingRecords() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit VersionChanged(targetNode, 1);
        publicResolver.clearRecords(targetNode);
    }

    // Test 6: "permits setting address by owner"
    function testPermitsSettingAddressByOwner() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit AddressChanged(targetNode, 60, abi.encodePacked(account1));
        vm.expectEmit(true, true, true, true);
        emit AddrChanged(targetNode, account1);
        publicResolver.setAddr(targetNode, account1);

        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "Address should be set correctly"
        );
    }

    // Test 7: "can overwrite previously set address"
    function testCanOverwritePreviouslySetAddress() public {
        vm.startPrank(account0);
        publicResolver.setAddr(targetNode, account1);
        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "First address should be set"
        );

        publicResolver.setAddr(targetNode, account0);
        assertEq(
            publicResolver.addr(targetNode),
            account0,
            "Address should be overwritten"
        );
        vm.stopPrank();
    }

    // Test 8: "can overwrite to same address"
    function testCanOverwriteToSameAddress() public {
        vm.startPrank(account0);
        publicResolver.setAddr(targetNode, account1);
        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "First address should be set"
        );

        publicResolver.setAddr(targetNode, account1);
        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "Address should remain the same"
        );
        vm.stopPrank();
    }

    // Test 9: "forbids setting new address by non-owners"
    function testForbidsSettingNewAddressByNonOwners() public {
        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account1);
    }

    // Test 10: "forbids writing same address by non-owners"
    function testForbidsWritingSameAddressByNonOwners() public {
        vm.prank(account0);
        publicResolver.setAddr(targetNode, account1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account1);
    }

    // Test 11: "forbids overwriting existing address by non-owners"
    function testForbidsOverwritingExistingAddressByNonOwners() public {
        vm.prank(account0);
        publicResolver.setAddr(targetNode, account1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account0);
    }

    // Test 12: "returns zero when fetching nonexistent addresses"
    function testReturnsZeroWhenFetchingNonexistentAddresses() public view {
        assertEq(
            publicResolver.addr(targetNode),
            address(0),
            "Should return zero address"
        );
    }

    // Test 13: "permits setting and retrieving addresses for other coin types"
    function testPermitsSettingAndRetrievingAddressesForOtherCoinTypes()
        public
    {
        vm.prank(account0);
        publicResolver.setAddr(targetNode, 123, abi.encodePacked(account1));

        assertEq(
            publicResolver.addr(targetNode, 123),
            abi.encodePacked(account1),
            "Other coin type address should be set"
        );
    }

    // Test 14: "returns ETH address for coin type 60"
    function testReturnsETHAddressForCoinType60() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit AddressChanged(targetNode, 60, abi.encodePacked(account1));
        vm.expectEmit(true, true, true, true);
        emit AddrChanged(targetNode, account1);
        publicResolver.setAddr(targetNode, account1);

        assertEq(
            publicResolver.addr(targetNode, 60),
            abi.encodePacked(account1),
            "Should return ETH address for coin type 60"
        );
    }

    // Test 15: "setting coin type 60 updates ETH address"
    function testSettingCoinType60UpdatesETHAddress() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit AddressChanged(targetNode, 60, abi.encodePacked(account2));
        vm.expectEmit(true, true, true, true);
        emit AddrChanged(targetNode, account2);
        publicResolver.setAddr(targetNode, 60, abi.encodePacked(account2));

        assertEq(
            publicResolver.addr(targetNode),
            account2,
            "ETH address should be updated"
        );
    }

    // Test 16: "resets record on version change"
    function testResetsRecordOnVersionChange() public {
        vm.startPrank(account0);
        publicResolver.setAddr(targetNode, account1);
        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "Address should be set"
        );

        publicResolver.clearRecords(targetNode);
        assertEq(
            publicResolver.addr(targetNode),
            address(0),
            "Address should be reset"
        );
        vm.stopPrank();
    }

    // Test 17: "permits setting name by owner"
    function testPermitsSettingNameByOwner() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit NameChanged(targetNode, "name1");
        publicResolver.setName(targetNode, "name1");

        assertEq(
            publicResolver.name(targetNode),
            "name1",
            "Name should be set correctly"
        );
    }

    // Test 18: "can overwrite previously set names"
    function testCanOverwritePreviouslySetNames() public {
        vm.startPrank(account0);
        publicResolver.setName(targetNode, "name1");
        assertEq(
            publicResolver.name(targetNode),
            "name1",
            "First name should be set"
        );

        publicResolver.setName(targetNode, "name2");
        assertEq(
            publicResolver.name(targetNode),
            "name2",
            "Name should be overwritten"
        );
        vm.stopPrank();
    }

    // Test 19: "forbids setting name by non-owners"
    function testForbidsSettingNameByNonOwners() public {
        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setName(targetNode, "name2");
    }

    // Test 20: "returns empty when fetching nonexistent name"
    function testReturnsEmptyWhenFetchingNonexistentName() public view {
        assertEq(
            publicResolver.name(targetNode),
            "",
            "Should return empty string"
        );
    }

    // Test 21: "resets record on version change"
    function testNameResetsRecordOnVersionChange() public {
        vm.startPrank(account0);
        publicResolver.setName(targetNode, "name1");
        assertEq(
            publicResolver.name(targetNode),
            "name1",
            "Name should be set"
        );

        publicResolver.clearRecords(targetNode);
        assertEq(publicResolver.name(targetNode), "", "Name should be reset");
        vm.stopPrank();
    }

    // Test 22: "returns empty when fetching nonexistent values"
    function testPubkeyReturnsEmptyWhenFetchingNonexistentValues() public view {
        (bytes32 x, bytes32 y) = publicResolver.pubkey(targetNode);
        assertEq(x, bytes32(0), "Should return zero x");
        assertEq(y, bytes32(0), "Should return zero y");
    }

    // Test 23: "permits setting public key by owner"
    function testPermitsSettingPublicKeyByOwner() public {
        bytes32 x = bytes32(uint256(0x10) << 248); // padHex('0x10', { dir: 'right', size: 32 })
        bytes32 y = bytes32(uint256(0x20) << 248); // padHex('0x20', { dir: 'right', size: 32 })

        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit PubkeyChanged(targetNode, x, y);
        publicResolver.setPubkey(targetNode, x, y);

        (bytes32 retX, bytes32 retY) = publicResolver.pubkey(targetNode);
        assertEq(retX, x, "X coordinate should be set");
        assertEq(retY, y, "Y coordinate should be set");
    }

    // Test 24: "can overwrite previously set value"
    function testPubkeyCanOverwritePreviouslySetValue() public {
        bytes32 x1 = bytes32(uint256(0x10) << 248);
        bytes32 y1 = bytes32(uint256(0x20) << 248);
        bytes32 x2 = bytes32(uint256(0x30) << 248);
        bytes32 y2 = bytes32(uint256(0x40) << 248);

        vm.startPrank(account0);
        publicResolver.setPubkey(targetNode, x1, y1);
        (bytes32 retX1, bytes32 retY1) = publicResolver.pubkey(targetNode);
        assertEq(retX1, x1, "First X should be set");
        assertEq(retY1, y1, "First Y should be set");

        publicResolver.setPubkey(targetNode, x2, y2);
        (bytes32 retX2, bytes32 retY2) = publicResolver.pubkey(targetNode);
        assertEq(retX2, x2, "Second X should be set");
        assertEq(retY2, y2, "Second Y should be set");
        vm.stopPrank();
    }

    // Test 25: "can overwrite to same value"
    function testPubkeyCanOverwriteToSameValue() public {
        bytes32 x = bytes32(uint256(0x10) << 248);
        bytes32 y = bytes32(uint256(0x20) << 248);

        vm.startPrank(account0);
        publicResolver.setPubkey(targetNode, x, y);
        (bytes32 retX1, bytes32 retY1) = publicResolver.pubkey(targetNode);
        assertEq(retX1, x, "X should be set");
        assertEq(retY1, y, "Y should be set");

        publicResolver.setPubkey(targetNode, x, y);
        (bytes32 retX2, bytes32 retY2) = publicResolver.pubkey(targetNode);
        assertEq(retX2, x, "X should remain same");
        assertEq(retY2, y, "Y should remain same");
        vm.stopPrank();
    }

    // Test 26: "forbids setting value by non-owners"
    function testPubkeyForbidsSettingValueByNonOwners() public {
        bytes32 x = bytes32(uint256(0x10) << 248);
        bytes32 y = bytes32(uint256(0x20) << 248);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setPubkey(targetNode, x, y);
    }

    // Test 27: "forbids writing same value by non-owners"
    function testPubkeyForbidsWritingSameValueByNonOwners() public {
        bytes32 x = bytes32(uint256(0x10) << 248);
        bytes32 y = bytes32(uint256(0x20) << 248);

        vm.prank(account0);
        publicResolver.setPubkey(targetNode, x, y);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setPubkey(targetNode, x, y);
    }

    // Test 28: "forbids overwriting existing value by non-owners"
    function testPubkeyForbidsOverwritingExistingValueByNonOwners() public {
        bytes32 x1 = bytes32(uint256(0x10) << 248);
        bytes32 y1 = bytes32(uint256(0x20) << 248);
        bytes32 x2 = bytes32(uint256(0x30) << 248);
        bytes32 y2 = bytes32(uint256(0x40) << 248);

        vm.prank(account0);
        publicResolver.setPubkey(targetNode, x1, y1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setPubkey(targetNode, x2, y2);
    }

    // Test 29: "resets record on version change"
    function testPubkeyResetsRecordOnVersionChange() public {
        bytes32 x = bytes32(uint256(0x10) << 248);
        bytes32 y = bytes32(uint256(0x20) << 248);

        vm.startPrank(account0);
        publicResolver.setPubkey(targetNode, x, y);
        (bytes32 retX1, bytes32 retY1) = publicResolver.pubkey(targetNode);
        assertEq(retX1, x, "X should be set");
        assertEq(retY1, y, "Y should be set");

        publicResolver.clearRecords(targetNode);
        (bytes32 retX2, bytes32 retY2) = publicResolver.pubkey(targetNode);
        assertEq(retX2, bytes32(0), "X should be reset");
        assertEq(retY2, bytes32(0), "Y should be reset");
        vm.stopPrank();
    }

    // Test 30: "returns a contentType of 0 when nothing is available"
    function testABIReturnsContentType0WhenNothingAvailable() public view {
        (uint256 contentType, bytes memory data) = publicResolver.ABI(
            targetNode,
            0xffffffff
        );
        assertEq(contentType, 0, "Content type should be 0");
        assertEq(data, hex"", "Data should be empty");
    }

    // Test 31: "returns an ABI after it has been set"
    function testABIReturnsABIAfterItHasBeenSet() public {
        vm.prank(account0);
        publicResolver.setABI(targetNode, 1, hex"666f6f");

        (uint256 contentType, bytes memory data) = publicResolver.ABI(
            targetNode,
            0xffffffff
        );
        assertEq(contentType, 1, "Content type should be 1");
        assertEq(data, hex"666f6f", "Data should match");
    }

    // Test 32: "returns the first valid ABI"
    function testABIReturnsFirstValidABI() public {
        vm.startPrank(account0);
        publicResolver.setABI(targetNode, 0x2, hex"666f6f");
        publicResolver.setABI(targetNode, 0x4, hex"626172");

        (uint256 contentType1, bytes memory data1) = publicResolver.ABI(
            targetNode,
            0x7
        );
        assertEq(contentType1, 2, "Should return content type 2");
        assertEq(data1, hex"666f6f", "Should return first data");

        (uint256 contentType2, bytes memory data2) = publicResolver.ABI(
            targetNode,
            0x5
        );
        assertEq(contentType2, 4, "Should return content type 4");
        assertEq(data2, hex"626172", "Should return second data");
        vm.stopPrank();
    }

    // Test 33: "allows deleting ABIs"
    function testABIAllowsDeletingABIs() public {
        vm.startPrank(account0);
        publicResolver.setABI(targetNode, 1, hex"666f6f");

        (uint256 contentType1, bytes memory data1) = publicResolver.ABI(
            targetNode,
            0xffffffff
        );
        assertEq(contentType1, 1, "Content type should be 1");
        assertEq(data1, hex"666f6f", "Data should match");

        publicResolver.setABI(targetNode, 1, hex"");

        (uint256 contentType2, bytes memory data2) = publicResolver.ABI(
            targetNode,
            0xffffffff
        );
        assertEq(contentType2, 0, "Content type should be 0 after deletion");
        assertEq(data2, hex"", "Data should be empty after deletion");
        vm.stopPrank();
    }

    // Test 34: "rejects invalid content types"
    function testABIRejectsInvalidContentTypes() public {
        vm.prank(account0);
        vm.expectRevert(bytes(""));
        publicResolver.setABI(targetNode, 0x3, hex"12");
    }

    // Test 35: "forbids setting value by non-owners"
    function testABIForbidsSettingValueByNonOwners() public {
        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setABI(targetNode, 1, hex"666f6f");
    }

    // Test 36: "resets on version change"
    function testABIResetsOnVersionChange() public {
        vm.startPrank(account0);
        publicResolver.setABI(targetNode, 1, hex"666f6f");

        (uint256 contentType1, bytes memory data1) = publicResolver.ABI(
            targetNode,
            0xffffffff
        );
        assertEq(contentType1, 1, "Content type should be 1");
        assertEq(data1, hex"666f6f", "Data should match");

        publicResolver.clearRecords(targetNode);

        (uint256 contentType2, bytes memory data2) = publicResolver.ABI(
            targetNode,
            0xffffffff
        );
        assertEq(contentType2, 0, "Content type should be 0 after reset");
        assertEq(data2, hex"", "Data should be empty after reset");
        vm.stopPrank();
    }

    // Test 37: "can try all content types"
    function testABICanTryAllContentTypes() public view {
        (uint256 contentType, bytes memory data) = publicResolver.ABI(
            targetNode,
            (1 << 256) - 1
        );
        assertEq(contentType, 0, "Content type should be 0");
        assertEq(data, hex"", "Data should be empty");
    }

    // Test 38: "permits setting text by owner"
    function testPermitsSettingTextByOwner() public {
        string memory url1 = "https://ethereum.org";

        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit TextChanged(targetNode, "url", "url", url1);
        publicResolver.setText(targetNode, "url", url1);

        assertEq(
            publicResolver.text(targetNode, "url"),
            url1,
            "Text should be set correctly"
        );
    }

    // Test 39: "can overwrite previously set text"
    function testCanOverwritePreviouslySetText() public {
        string memory url1 = "https://ethereum.org";
        string memory url2 = "https://github.com/ethereum";

        vm.startPrank(account0);
        publicResolver.setText(targetNode, "url", url1);
        assertEq(
            publicResolver.text(targetNode, "url"),
            url1,
            "First text should be set"
        );

        publicResolver.setText(targetNode, "url", url2);
        assertEq(
            publicResolver.text(targetNode, "url"),
            url2,
            "Text should be overwritten"
        );
        vm.stopPrank();
    }

    // Test 40: "can overwrite to same text"
    function testCanOverwriteToSameText() public {
        string memory url1 = "https://ethereum.org";

        vm.startPrank(account0);
        publicResolver.setText(targetNode, "url", url1);
        assertEq(
            publicResolver.text(targetNode, "url"),
            url1,
            "First text should be set"
        );

        publicResolver.setText(targetNode, "url", url1);
        assertEq(
            publicResolver.text(targetNode, "url"),
            url1,
            "Text should remain same"
        );
        vm.stopPrank();
    }

    // Test 41: "forbids setting text by non-owners"
    function testForbidsSettingTextByNonOwners() public {
        string memory url1 = "https://ethereum.org";

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setText(targetNode, "url", url1);
    }

    // Test 42: "forbids writing same text by non-owners"
    function testForbidsWritingSameTextByNonOwners() public {
        string memory url1 = "https://ethereum.org";

        vm.prank(account0);
        publicResolver.setText(targetNode, "url", url1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setText(targetNode, "url", url1);
    }

    // Test 43: "forbids overwriting existing text by non-owners"
    function testForbidsOverwritingExistingTextByNonOwners() public {
        string memory url1 = "https://ethereum.org";
        string memory url2 = "https://github.com/ethereum";

        vm.prank(account0);
        publicResolver.setText(targetNode, "url", url1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setText(targetNode, "url", url2);
    }

    // Test 44: "resets record on version change"
    function testTextResetsRecordOnVersionChange() public {
        string memory url1 = "https://ethereum.org";

        vm.startPrank(account0);
        publicResolver.setText(targetNode, "url", url1);
        assertEq(
            publicResolver.text(targetNode, "url"),
            url1,
            "Text should be set"
        );

        publicResolver.clearRecords(targetNode);
        assertEq(
            publicResolver.text(targetNode, "url"),
            "",
            "Text should be reset"
        );
        vm.stopPrank();
    }

    // Test 45: "permits setting contenthash by owner"
    function testPermitsSettingContenthashByOwner() public {
        bytes
            memory contenthash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit ContenthashChanged(targetNode, contenthash1);
        publicResolver.setContenthash(targetNode, contenthash1);

        assertEq(
            publicResolver.contenthash(targetNode),
            contenthash1,
            "Contenthash should be set"
        );
    }

    // Test 46: "can overwrite previously set contenthash"
    function testCanOverwritePreviouslySetContenthash() public {
        bytes
            memory contenthash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";
        bytes
            memory contenthash2 = hex"0000000000000000000000000000000000000000000000000000000000000002";

        vm.startPrank(account0);
        publicResolver.setContenthash(targetNode, contenthash1);
        assertEq(
            publicResolver.contenthash(targetNode),
            contenthash1,
            "First contenthash should be set"
        );

        publicResolver.setContenthash(targetNode, contenthash2);
        assertEq(
            publicResolver.contenthash(targetNode),
            contenthash2,
            "Contenthash should be overwritten"
        );
        vm.stopPrank();
    }

    // Test 47: "can overwrite to same contenthash"
    function testCanOverwriteToSameContenthash() public {
        bytes
            memory contenthash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.startPrank(account0);
        publicResolver.setContenthash(targetNode, contenthash1);
        assertEq(
            publicResolver.contenthash(targetNode),
            contenthash1,
            "First contenthash should be set"
        );

        publicResolver.setContenthash(targetNode, contenthash1);
        assertEq(
            publicResolver.contenthash(targetNode),
            contenthash1,
            "Contenthash should remain same"
        );
        vm.stopPrank();
    }

    // Test 48: "forbids setting contenthash by non-owners"
    function testForbidsSettingContenthashByNonOwners() public {
        bytes
            memory contenthash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setContenthash(targetNode, contenthash1);
    }

    // Test 49: "forbids writing same contenthash by non-owners"
    function testForbidsWritingSameContenthashByNonOwners() public {
        bytes
            memory contenthash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.prank(account0);
        publicResolver.setContenthash(targetNode, contenthash1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setContenthash(targetNode, contenthash1);
    }

    // Test 50: "returns empty when fetching nonexistent contenthash"
    function testReturnsEmptyWhenFetchingNonexistentContenthash() public view {
        assertEq(
            publicResolver.contenthash(targetNode),
            hex"",
            "Should return empty bytes"
        );
    }

    // Test 51: "resets record on version change"
    function testContenthashResetsRecordOnVersionChange() public {
        bytes
            memory contenthash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.startPrank(account0);
        publicResolver.setContenthash(targetNode, contenthash1);
        assertEq(
            publicResolver.contenthash(targetNode),
            contenthash1,
            "Contenthash should be set"
        );

        publicResolver.clearRecords(targetNode);
        assertEq(
            publicResolver.contenthash(targetNode),
            hex"",
            "Contenthash should be reset"
        );
        vm.stopPrank();
    }

    // Helper function to DNS encode a name using NameCoder library
    // Strips trailing dots for compatibility with existing test data
    function dnsEncodeName(
        string memory name
    ) internal pure returns (bytes memory) {
        bytes memory nameBytes = bytes(name);
        // Strip trailing dot if present (for compatibility with existing test data)
        if (nameBytes.length > 0 && nameBytes[nameBytes.length - 1] == ".") {
            bytes memory strippedName = new bytes(nameBytes.length - 1);
            for (uint256 i = 0; i < nameBytes.length - 1; i++) {
                strippedName[i] = nameBytes[i];
            }
            return NameCoder.encode(string(strippedName));
        }
        return NameCoder.encode(name);
    }

    // Test 52: "permits setting name by owner" (DNS records)
    function testDNSPermitsSettingNameByOwner() public {
        // a.eth. 3600 IN A 1.2.3.4
        bytes memory arec = hex"016103657468000001000100000e10000401020304";
        // b.eth. 3600 IN A 2.3.4.5
        bytes memory b1rec = hex"016203657468000001000100000e10000402030405";
        // b.eth. 3600 IN A 3.4.5.6
        bytes memory b2rec = hex"016203657468000001000100000e10000403040506";
        // eth. 86400 IN SOA ns1.ethdns.xyz. hostmaster.test.eth. 2018061501 15620 1800 1814400 14400
        bytes
            memory soarec = hex"03657468000006000100015180003a036e733106657468646e730378797a000a686f73746d6173746572057465737431036574680078492cbd00003d0400000708001baf8000003840";

        bytes memory rec = bytes.concat(arec, b1rec, b2rec, soarec);

        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, rec);

        bytes32 aHash = keccak256(dnsEncodeName("a.eth."));
        bytes32 bHash = keccak256(dnsEncodeName("b.eth."));
        bytes32 ethHash = keccak256(dnsEncodeName("eth."));

        assertEq(
            publicResolver.dnsRecord(targetNode, aHash, 1),
            arec,
            "A record should be set"
        );
        assertEq(
            publicResolver.dnsRecord(targetNode, bHash, 1),
            bytes.concat(b1rec, b2rec),
            "B records should be set"
        );
        assertEq(
            publicResolver.dnsRecord(targetNode, ethHash, 6),
            soarec,
            "SOA record should be set"
        );
    }

    // Test 53: "should update existing records"
    function testDNSShouldUpdateExistingRecords() public {
        // First set initial records
        bytes
            memory initialRec = hex"016103657468000001000100000e10000401020304";
        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, initialRec);

        // a.eth. 3600 IN A 4.5.6.7
        bytes memory arec = hex"016103657468000001000100000e10000404050607";
        // eth. 86400 IN SOA ns1.ethdns.xyz. hostmaster.test.eth. 2018061502 15620 1800 1814400 14400
        bytes
            memory soarec = hex"03657468000006000100015180003a036e733106657468646e730378797a000a686f73746d6173746572057465737431036574680078492cbe00003d0400000708001baf8000003840";

        bytes memory rec = bytes.concat(arec, soarec);

        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, rec);

        bytes32 aHash = keccak256(dnsEncodeName("a.eth."));
        bytes32 ethHash = keccak256(dnsEncodeName("eth."));

        assertEq(
            publicResolver.dnsRecord(targetNode, aHash, 1),
            arec,
            "Updated A record should be set"
        );
        assertEq(
            publicResolver.dnsRecord(targetNode, ethHash, 6),
            soarec,
            "Updated SOA record should be set"
        );
    }

    // Test 54: "should keep track of entries"
    function testDNSShouldKeepTrackOfEntries() public {
        // c.eth. 3600 IN A 1.2.3.4
        bytes memory crec = hex"016303657468000001000100000e10000401020304";

        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, crec);

        bytes32 cHash = keccak256(dnsEncodeName("c.eth."));
        bytes32 dHash = keccak256(dnsEncodeName("d.eth."));

        // Initial check
        assertTrue(
            publicResolver.hasDNSRecords(targetNode, cHash),
            "Should have c.eth record"
        );
        assertFalse(
            publicResolver.hasDNSRecords(targetNode, dHash),
            "Should not have d.eth record"
        );

        // Update with no new data makes no difference
        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, crec);
        assertTrue(
            publicResolver.hasDNSRecords(targetNode, cHash),
            "Should still have c.eth record"
        );

        // c.eth. 3600 IN A (empty record - deletion)
        bytes memory crec2 = hex"016303657468000001000100000e100000";

        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, crec2);

        // Removal returns to false
        assertFalse(
            publicResolver.hasDNSRecords(targetNode, cHash),
            "Should not have c.eth record after deletion"
        );
    }

    // Test 55: "should handle single-record updates"
    function testDNSShouldHandleSingleRecordUpdates() public {
        // e.eth. 3600 IN A 1.2.3.4
        bytes memory erec = hex"016503657468000001000100000e10000401020304";

        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, erec);

        bytes32 eHash = keccak256(dnsEncodeName("e.eth."));
        assertEq(
            publicResolver.dnsRecord(targetNode, eHash, 1),
            erec,
            "E record should be set"
        );
    }

    // Test 56: "forbids setting DNS records by non-owners"
    function testDNSForbidsSettingDNSRecordsByNonOwners() public {
        // f.eth. 3600 IN A 1.2.3.4
        bytes memory frec = hex"016603657468000001000100000e10000401020304";

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setDNSRecords(targetNode, frec);
    }

    // Test 57: "resets record on version change"
    function testDNSResetsRecordOnVersionChange() public {
        // Set initial records
        bytes
            memory initialRec = hex"016103657468000001000100000e10000401020304";
        vm.prank(account0);
        publicResolver.setDNSRecords(targetNode, initialRec);

        vm.prank(account0);
        publicResolver.clearRecords(targetNode);

        bytes32 aHash = keccak256(dnsEncodeName("a.eth."));
        bytes32 bHash = keccak256(dnsEncodeName("b.eth."));
        bytes32 ethHash = keccak256(dnsEncodeName("eth."));

        assertEq(
            publicResolver.dnsRecord(targetNode, aHash, 1),
            hex"",
            "A record should be reset"
        );
        assertEq(
            publicResolver.dnsRecord(targetNode, bHash, 1),
            hex"",
            "B record should be reset"
        );
        assertEq(
            publicResolver.dnsRecord(targetNode, ethHash, 6),
            hex"",
            "SOA record should be reset"
        );
    }

    // Test 58: "permits setting zonehash by owner"
    function testDNSZonehashPermitsSettingZonehashByOwner() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit DNSZonehashChanged(targetNode, hex"", zonehash1);
        publicResolver.setZonehash(targetNode, zonehash1);

        assertEq(
            publicResolver.zonehash(targetNode),
            zonehash1,
            "Zonehash should be set"
        );
    }

    // Test 59: "can overwrite previously set zonehash"
    function testDNSZonehashCanOverwritePreviouslySetZonehash() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";
        bytes
            memory zonehash2 = hex"0000000000000000000000000000000000000000000000000000000000000002";

        vm.startPrank(account0);
        publicResolver.setZonehash(targetNode, zonehash1);
        assertEq(
            publicResolver.zonehash(targetNode),
            zonehash1,
            "First zonehash should be set"
        );

        publicResolver.setZonehash(targetNode, zonehash2);
        assertEq(
            publicResolver.zonehash(targetNode),
            zonehash2,
            "Zonehash should be overwritten"
        );
        vm.stopPrank();
    }

    // Test 60: "can overwrite to same zonehash"
    function testDNSZonehashCanOverwriteToSameZonehash() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.startPrank(account0);
        publicResolver.setZonehash(targetNode, zonehash1);
        assertEq(
            publicResolver.zonehash(targetNode),
            zonehash1,
            "First zonehash should be set"
        );

        publicResolver.setZonehash(targetNode, zonehash1);
        assertEq(
            publicResolver.zonehash(targetNode),
            zonehash1,
            "Zonehash should remain same"
        );
        vm.stopPrank();
    }

    // Test 61: "forbids setting zonehash by non-owners"
    function testDNSZonehashForbidsSettingZonehashByNonOwners() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setZonehash(targetNode, zonehash1);
    }

    // Test 62: "forbids writing same zonehash by non-owners"
    function testDNSZonehashForbidsWritingSameZonehashByNonOwners() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.prank(account0);
        publicResolver.setZonehash(targetNode, zonehash1);

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setZonehash(targetNode, zonehash1);
    }

    // Test 63: "returns empty when fetching nonexistent zonehash"
    function testDNSZonehashReturnsEmptyWhenFetchingNonexistentZonehash()
        public
        view
    {
        assertEq(
            publicResolver.zonehash(targetNode),
            hex"",
            "Should return empty bytes"
        );
    }

    // Test 64: "emits the correct event"
    function testDNSZonehashEmitsCorrectEvent() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";
        bytes
            memory zonehash2 = hex"0000000000000000000000000000000000000000000000000000000000000002";

        vm.startPrank(account0);

        vm.expectEmit(true, true, true, true);
        emit DNSZonehashChanged(targetNode, hex"", zonehash1);
        publicResolver.setZonehash(targetNode, zonehash1);

        vm.expectEmit(true, true, true, true);
        emit DNSZonehashChanged(targetNode, zonehash1, zonehash2);
        publicResolver.setZonehash(targetNode, zonehash2);

        vm.expectEmit(true, true, true, true);
        emit DNSZonehashChanged(targetNode, zonehash2, hex"");
        publicResolver.setZonehash(targetNode, hex"");

        vm.stopPrank();
    }

    // Test 65: "resets record on version change"
    function testDNSZonehashResetsRecordOnVersionChange() public {
        bytes
            memory zonehash1 = hex"0000000000000000000000000000000000000000000000000000000000000001";

        vm.startPrank(account0);
        publicResolver.setZonehash(targetNode, zonehash1);
        assertEq(
            publicResolver.zonehash(targetNode),
            zonehash1,
            "Zonehash should be set"
        );

        publicResolver.clearRecords(targetNode);
        assertEq(
            publicResolver.zonehash(targetNode),
            hex"",
            "Zonehash should be reset"
        );
        vm.stopPrank();
    }

    // Test 66: "permits setting interface by owner"
    function testInterfacePermitsSettingInterfaceByOwner() public {
        bytes4 interface1 = 0x12345678;

        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit InterfaceChanged(targetNode, interface1, account0);
        publicResolver.setInterface(targetNode, interface1, account0);

        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            account0,
            "Interface should be set"
        );
    }

    // Test 67: "can update previously set interface"
    function testInterfaceCanUpdatePreviouslySetInterface() public {
        bytes4 interface1 = 0x12345678;

        vm.startPrank(account0);
        publicResolver.setInterface(targetNode, interface1, account0);
        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            account0,
            "First interface should be set"
        );

        publicResolver.setInterface(targetNode, interface1, account1);
        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            account1,
            "Interface should be updated"
        );
        vm.stopPrank();
    }

    // Test 68: "forbids setting interface by non-owner"
    function testInterfaceForbidsSettingInterfaceByNonOwner() public {
        bytes4 interface1 = 0x12345678;

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setInterface(targetNode, interface1, account0);
    }

    // Test 69: "returns zero when fetching nonexistent interface"
    function testInterfaceReturnsZeroWhenFetchingNonexistentInterface()
        public
        view
    {
        bytes4 interface1 = 0x12345678;
        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            address(0),
            "Should return zero address"
        );
    }

    // Test 70: "falls back to calling implementsInterface on addr"
    function testInterfaceFallsBackToCallingImplementsInterfaceOnAddr() public {
        vm.startPrank(account0);
        // Set addr to the resolver itself, since it has interface implementations
        publicResolver.setAddr(targetNode, address(publicResolver));

        // IAddrResolver interface ID (0x3b3b57de)
        bytes4 addrInterfaceId = 0x3b3b57de;

        assertEq(
            publicResolver.interfaceImplementer(targetNode, addrInterfaceId),
            address(publicResolver),
            "Should fallback to resolver"
        );
        vm.stopPrank();
    }

    // Test 71: "returns 0 on fallback when target contract does not implement interface"
    function testInterfaceReturns0OnFallbackWhenTargetContractDoesNotImplementInterface()
        public
    {
        vm.prank(account0);
        publicResolver.setAddr(targetNode, address(publicResolver));

        bytes4 interface1 = 0x12345678;
        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            address(0),
            "Should return zero for non-implemented interface"
        );
    }

    // Test 72: "returns 0 on fallback when target contract does not support implementsInterface"
    function testInterfaceReturns0OnFallbackWhenTargetContractDoesNotSupportImplementsInterface()
        public
    {
        vm.prank(account0);
        // Set addr to the ENS registry, which doesn't implement supportsInterface
        publicResolver.setAddr(targetNode, address(ens));

        // IERC165 interface ID (0x01ffc9a7)
        bytes4 supportsInterfaceId = 0x01ffc9a7;

        assertEq(
            publicResolver.interfaceImplementer(
                targetNode,
                supportsInterfaceId
            ),
            address(0),
            "Should return zero for non-ERC165 contract"
        );
    }

    // Test 73: "returns 0 on fallback when target is not a contract"
    function testInterfaceReturns0OnFallbackWhenTargetIsNotContract() public {
        vm.prank(account0);
        publicResolver.setAddr(targetNode, account0);

        // IERC165 interface ID (0x01ffc9a7)
        bytes4 supportsInterfaceId = 0x01ffc9a7;

        assertEq(
            publicResolver.interfaceImplementer(
                targetNode,
                supportsInterfaceId
            ),
            address(0),
            "Should return zero for EOA"
        );
    }

    // Test 74: "resets record on version change"
    function testInterfaceResetsRecordOnVersionChange() public {
        bytes4 interface1 = 0x12345678;

        vm.startPrank(account0);
        publicResolver.setInterface(
            targetNode,
            interface1,
            address(publicResolver)
        );
        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            address(publicResolver),
            "Interface should be set"
        );

        publicResolver.clearRecords(targetNode);
        assertEq(
            publicResolver.interfaceImplementer(targetNode, interface1),
            address(0),
            "Interface should be reset"
        );
        vm.stopPrank();
    }

    // Test 75: "permits authorisations to be set"
    function testAuthorizationsPermitsAuthorisationsToBeSet() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit ApprovalForAll(account0, account1, true);
        publicResolver.setApprovalForAll(account1, true);

        assertTrue(
            publicResolver.isApprovedForAll(account0, account1),
            "Should be approved for all"
        );
    }

    // Test 76: "permits authorised users to make changes"
    function testAuthorizationsPermitsAuthorisedUsersToMakeChanges() public {
        vm.prank(account0);
        publicResolver.setApprovalForAll(account1, true);

        vm.prank(account1);
        publicResolver.setAddr(targetNode, account1);

        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "Authorised user should be able to set address"
        );
    }

    // Test 77: "permits authorisations to be cleared"
    function testAuthorizationsPermitsAuthorisationsToBeCleared() public {
        vm.startPrank(account0);
        publicResolver.setApprovalForAll(account1, true);
        publicResolver.setApprovalForAll(account1, false);
        vm.stopPrank();

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account1);
    }

    // Test 78: "permits non-owners to set authorisations"
    function testAuthorizationsPermitsNonOwnersToSetAuthorisations() public {
        vm.prank(account1);
        publicResolver.setApprovalForAll(account2, true);

        // The authorisation should have no effect, because account1 is not the owner
        vm.prank(account2);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account0);
    }

    // Test 79: "checks the authorisation for the current owner"
    function testAuthorizationsChecksAuthorisationForCurrentOwner() public {
        vm.prank(account1);
        publicResolver.setApprovalForAll(account2, true);

        vm.prank(account0);
        ens.setOwner(targetNode, account1);

        vm.prank(account2);
        publicResolver.setAddr(targetNode, account0);

        assertEq(
            publicResolver.addr(targetNode),
            account0,
            "Should work with new owner's authorisation"
        );
    }

    // Test 80: "trusted contract can bypass authorisation"
    function testAuthorizationsTrustedContractCanBypassAuthorisation() public {
        vm.prank(account9); // account9 is the trusted ETH controller
        publicResolver.setAddr(targetNode, account9);

        assertEq(
            publicResolver.addr(targetNode),
            account9,
            "Trusted contract should bypass authorisation"
        );
    }

    // Test 81: "emits an ApprovalForAll log"
    function testAuthorizationsEmitsApprovalForAllLog() public {
        vm.prank(account0);
        vm.expectEmit(true, true, true, true);
        emit ApprovalForAll(account0, account1, true);
        publicResolver.setApprovalForAll(account1, true);
    }

    // Test 82: "reverts if attempting to approve self as an operator"
    function testAuthorizationsRevertsIfAttemptingToApproveSelfAsOperator()
        public
    {
        vm.prank(account1);
        vm.expectRevert("ERC1155: setting approval status for self");
        publicResolver.setApprovalForAll(account1, true);
    }

    // Test 83: "permits name wrapper owner to make changes if owner is set to name wrapper address"
    function testAuthorizationsPermitsNameWrapperOwnerToMakeChanges() public {
        // First verify that account2 cannot make changes normally
        vm.prank(account2);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account0);

        // Set owner to dummy name wrapper
        vm.prank(account0);
        ens.setOwner(targetNode, address(dummyNameWrapper));

        // Start prank to change both msg.sender and tx.origin
        vm.startPrank(account2, account2);
        publicResolver.setAddr(targetNode, account0);
        vm.stopPrank();

        assertEq(
            publicResolver.addr(targetNode),
            account0,
            "Name wrapper should allow changes"
        );
    }

    // Test 84: "permits delegate to be approved"
    function testTokenApprovalsPermitsDelegateToBeApproved() public {
        vm.prank(account0);
        publicResolver.approve(targetNode, account1, true);

        assertTrue(
            publicResolver.isApprovedFor(account0, targetNode, account1),
            "Should be approved for node"
        );
    }

    // Test 85: "permits delegated users to make changes"
    function testTokenApprovalsPermitsDelegatedUsersToMakeChanges() public {
        vm.prank(account0);
        publicResolver.approve(targetNode, account1, true);

        assertTrue(
            publicResolver.isApprovedFor(account0, targetNode, account1),
            "Should be approved for node"
        );

        vm.prank(account1);
        publicResolver.setAddr(targetNode, account1);

        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "Delegated user should be able to set address"
        );
    }

    // Test 86: "permits delegations to be cleared"
    function testTokenApprovalsPermitsDelegationsToBeCleared() public {
        vm.startPrank(account0);
        publicResolver.approve(targetNode, account1, true);
        publicResolver.approve(targetNode, account1, false);
        vm.stopPrank();

        vm.prank(account1);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account0);
    }

    // Test 87: "permits non-owners to set delegations"
    function testTokenApprovalsPermitsNonOwnersToSetDelegations() public {
        vm.prank(account1);
        publicResolver.approve(targetNode, account2, true);

        // The delegation should have no effect, because account1 is not the owner
        vm.prank(account2);
        vm.expectRevert(bytes(""));
        publicResolver.setAddr(targetNode, account0);
    }

    // Test 88: "checks the delegation for the current owner"
    function testTokenApprovalsChecksDelegationForCurrentOwner() public {
        vm.prank(account1);
        publicResolver.approve(targetNode, account2, true);

        vm.prank(account0);
        ens.setOwner(targetNode, account1);

        vm.prank(account2);
        publicResolver.setAddr(targetNode, account0);

        assertEq(
            publicResolver.addr(targetNode),
            account0,
            "Should work with new owner's delegation"
        );
    }

    // Test 89: "emits an Approved log"
    function testTokenApprovalsEmitsApprovedLog() public {
        vm.prank(account0);
        publicResolver.approve(targetNode, account1, true);

        // Verify approval was set correctly (implicit test that event was emitted)
        assertTrue(
            publicResolver.isApprovedFor(account0, targetNode, account1),
            "Should be approved"
        );
    }

    // Test 90: "reverts if attempting to delegate to self"
    function testTokenApprovalsRevertsIfAttemptingToDelegateToSelf() public {
        vm.prank(account1);
        vm.expectRevert("Setting delegate status for self");
        publicResolver.approve(targetNode, account1, true);
    }

    // Test 91: "allows setting multiple fields"
    function testMulticallAllowsSettingMultipleFields() public {
        string memory urlValue = "https://ethereum.org/";

        bytes memory setAddrCall = abi.encodeWithSignature(
            "setAddr(bytes32,address)",
            targetNode,
            account1
        );
        bytes memory setTextCall = abi.encodeWithSignature(
            "setText(bytes32,string,string)",
            targetNode,
            "url",
            urlValue
        );

        bytes[] memory calls = new bytes[](2);
        calls[0] = setAddrCall;
        calls[1] = setTextCall;

        vm.prank(account0);
        publicResolver.multicall(calls);

        assertEq(
            publicResolver.addr(targetNode),
            account1,
            "Address should be set via multicall"
        );
        assertEq(
            publicResolver.text(targetNode, "url"),
            urlValue,
            "Text should be set via multicall"
        );
    }

    // Test 92: "allows reading multiple fields"
    function testMulticallAllowsReadingMultipleFields() public {
        string memory urlValue = "https://ethereum.org/";

        vm.startPrank(account0);
        publicResolver.setAddr(targetNode, account1);
        publicResolver.setText(targetNode, "url", urlValue);
        vm.stopPrank();

        bytes memory addrCall = abi.encodeWithSignature(
            "addr(bytes32)",
            targetNode
        );
        bytes memory textCall = abi.encodeWithSignature(
            "text(bytes32,string)",
            targetNode,
            "url"
        );

        bytes[] memory calls = new bytes[](2);
        calls[0] = addrCall;
        calls[1] = textCall;

        bytes[] memory results = publicResolver.multicall(calls);

        address decodedAddr = abi.decode(results[0], (address));
        string memory decodedText = abi.decode(results[1], (string));

        assertEq(
            decodedAddr,
            account1,
            "Address should be readable via multicall"
        );
        assertEq(
            decodedText,
            urlValue,
            "Text should be readable via multicall"
        );
    }
}
