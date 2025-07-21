// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/reverseResolver/ETHReverseResolver.sol";
import "../../contracts/reverseResolver/INameReverser.sol";
import "../../contracts/reverseRegistrar/DefaultReverseRegistrar.sol";
import "../../contracts/universalResolver/mocks/DummyShapeshiftResolver.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/utils/ENSIP19.sol";
import "../../contracts/utils/UniversalSigValidator.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";
import "../../contracts/resolvers/profiles/INameResolver.sol";
import "../../contracts/resolvers/profiles/IAddrResolver.sol";
import "../../contracts/resolvers/profiles/ITextResolver.sol";

/**
 * @title TestETHReverseResolver
 * @dev Tests for ETHReverseResolver that handles Ethereum address reverse resolution
 */
contract TestETHReverseResolver is Test {
    ETHReverseResolver public ethReverseResolver;
    DefaultReverseRegistrar public addrRegistrar;
    DefaultReverseRegistrar public defaultRegistrar;
    DummyShapeshiftResolver public shapeshiftResolver;
    ENSRegistry public ensRegistry;
    UniversalSigValidator public universalSigValidator;

    address public constant OWNER = address(0x3);
    address public USER;
    address public RELAYER;

    string constant TEST_NAME = "test.eth";
    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
    bytes32 constant DEFAULT_REVERSE_NODE =
        keccak256(abi.encodePacked(bytes32(0), keccak256("default")));

    // Events
    event NameForAddrChanged(address indexed addr, string name);

    function setUp() public {
        USER = vm.addr(1);
        RELAYER = vm.addr(2);

        vm.startPrank(OWNER);

        universalSigValidator = new UniversalSigValidator();
        address expectedValidatorAddress = 0x164af34fAF9879394370C7f09064127C043A35E9;
        vm.etch(expectedValidatorAddress, address(universalSigValidator).code);

        ensRegistry = new ENSRegistry();
        addrRegistrar = new DefaultReverseRegistrar();
        defaultRegistrar = new DefaultReverseRegistrar();
        shapeshiftResolver = new DummyShapeshiftResolver();

        ethReverseResolver = new ETHReverseResolver(
            ensRegistry,
            addrRegistrar,
            defaultRegistrar
        );

        bytes32 reverseNamespace = keccak256(
            abi.encodePacked(bytes32(0), keccak256("reverse"))
        );
        bytes32 addrReverseNamespace = keccak256(
            abi.encodePacked(reverseNamespace, keccak256("addr"))
        );
        bytes32 defaultReverseNamespace = keccak256(
            abi.encodePacked(reverseNamespace, keccak256("default"))
        );

        ensRegistry.setSubnodeOwner(bytes32(0), keccak256("reverse"), OWNER);
        ensRegistry.setSubnodeOwner(reverseNamespace, keccak256("addr"), OWNER);
        ensRegistry.setSubnodeOwner(
            reverseNamespace,
            keccak256("default"),
            OWNER
        );

        ensRegistry.setResolver(
            addrReverseNamespace,
            address(ethReverseResolver)
        );

        vm.stopPrank();
    }

    function testSupportsInterface() public view {
        assertTrue(
            ethReverseResolver.supportsInterface(0x01ffc9a7),
            "Should support ERC165"
        );
        assertTrue(
            ethReverseResolver.supportsInterface(
                type(IExtendedResolver).interfaceId
            ),
            "Should support IExtendedResolver"
        );
        assertTrue(
            ethReverseResolver.supportsInterface(
                type(INameReverser).interfaceId
            ),
            "Should support INameReverser"
        );
    }

    function testCoinType() public view {
        assertEq(
            ethReverseResolver.coinType(),
            COIN_TYPE_ETH,
            "Should return ETH coin type"
        );
    }

    function testChainId() public view {
        assertEq(
            ethReverseResolver.chainId(),
            1,
            "Should return correct chain ID"
        );
    }

    function testAddrRegistrar() public view {
        assertEq(
            address(ethReverseResolver.addrRegistrar()),
            address(addrRegistrar),
            "Should return addr registrar address"
        );
    }

    function testResolveFromAddrRegistrar() public {
        vm.startPrank(USER);

        // Set name via addr registrar
        addrRegistrar.setName(TEST_NAME);

        vm.stopPrank();

        // Create name query for USER's reverse record
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".addr.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            _getNode(reverseName)
        );

        // Should resolve to TEST_NAME via addr registrar
        bytes memory result = ethReverseResolver.resolve(encodedName, nameCall);
        string memory resolvedName = abi.decode(result, (string));
        assertEq(
            resolvedName,
            TEST_NAME,
            "Should resolve name from addr registrar"
        );
    }

    function testResolveFromDefaultRegistrar() public {
        vm.startPrank(USER);

        // Set name via default registrar (not addr registrar)
        defaultRegistrar.setName(TEST_NAME);

        vm.stopPrank();

        // Create name query for USER's reverse record
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".addr.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            _getNode(reverseName)
        );

        // Should resolve to TEST_NAME via default registrar fallback
        bytes memory result = ethReverseResolver.resolve(encodedName, nameCall);
        string memory resolvedName = abi.decode(result, (string));
        assertEq(
            resolvedName,
            TEST_NAME,
            "Should resolve name from default registrar as fallback"
        );
    }

    function testResolveEmpty() public {
        // Create name query for USER's reverse record (no name set)
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".addr.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            _getNode(reverseName)
        );

        // Should resolve to empty string
        bytes memory result = ethReverseResolver.resolve(encodedName, nameCall);
        string memory resolvedName = abi.decode(result, (string));
        assertEq(
            resolvedName,
            "",
            "Should resolve to empty string when no name is set"
        );
    }

    function testResolveNames() public {
        address[] memory addrs = new address[](3);
        addrs[0] = USER;
        addrs[1] = RELAYER;
        addrs[2] = OWNER;

        // Set names for first two addresses
        vm.prank(USER);
        addrRegistrar.setName("user.eth");

        vm.prank(RELAYER);
        defaultRegistrar.setName("relayer.eth");

        // Resolve all names
        string[] memory names = ethReverseResolver.resolveNames(addrs, 0); // perPage ignored

        assertEq(names.length, 3, "Should return array of correct length");
        assertEq(
            names[0],
            "user.eth",
            "Should resolve USER's name from addr registrar"
        );
        assertEq(
            names[1],
            "relayer.eth",
            "Should resolve RELAYER's name from default registrar"
        );
        assertEq(
            names[2],
            "",
            "Should return empty string for OWNER with no name set"
        );
    }

    function testResolveRegistrarAddress() public {
        // Create addr query for addr.reverse namespace
        string memory addrReverseName = "addr.reverse";
        bytes memory encodedName = _dnsEncodeName(addrReverseName);
        bytes memory addrCall = abi.encodeWithSelector(
            IAddrResolver.addr.selector,
            _getNode(addrReverseName)
        );

        // Should resolve to addr registrar address
        bytes memory result = ethReverseResolver.resolve(encodedName, addrCall);
        address resolvedAddr = abi.decode(result, (address));
        assertEq(
            resolvedAddr,
            address(addrRegistrar),
            "Should resolve addr.reverse to addr registrar address"
        );
    }

    function testRevertUnsupportedProfile() public {
        // Create text query (unsupported)
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".addr.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory textCall = abi.encodeWithSelector(
            ITextResolver.text.selector,
            _getNode(reverseName),
            "dne"
        );

        // Should revert with UnsupportedResolverProfile
        vm.expectRevert(
            abi.encodeWithSignature(
                "UnsupportedResolverProfile(bytes4)",
                ITextResolver.text.selector
            )
        );
        ethReverseResolver.resolve(encodedName, textCall);
    }

    // Helper functions
    function _addressToHex(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(40);
        bytes memory alphabet = "0123456789abcdef";

        for (uint256 i = 0; i < 20; i++) {
            buffer[i * 2] = alphabet[uint8(bytes20(addr)[i]) >> 4];
            buffer[i * 2 + 1] = alphabet[uint8(bytes20(addr)[i]) & 0xf];
        }

        return string(buffer);
    }

    function _dnsEncodeName(
        string memory name
    ) internal pure returns (bytes memory) {
        bytes memory nameBytes = bytes(name);
        bytes memory encoded = new bytes(nameBytes.length + 2);

        uint256 labelStart = 0;
        uint256 encodedIndex = 0;

        for (uint256 i = 0; i <= nameBytes.length; i++) {
            if (i == nameBytes.length || nameBytes[i] == ".") {
                uint256 labelLength = i - labelStart;
                encoded[encodedIndex++] = bytes1(uint8(labelLength));

                for (uint256 j = labelStart; j < i; j++) {
                    encoded[encodedIndex++] = nameBytes[j];
                }

                labelStart = i + 1;
            }
        }

        encoded[encodedIndex] = 0x00; // null terminator

        // Resize to actual length
        bytes memory result = new bytes(encodedIndex + 1);
        for (uint256 i = 0; i <= encodedIndex; i++) {
            result[i] = encoded[i];
        }

        return result;
    }

    function _getNode(string memory name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(name))));
    }
}
