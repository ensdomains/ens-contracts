// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/reverseResolver/DefaultReverseResolver.sol";
import "../../contracts/reverseResolver/INameReverser.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";
import "../../contracts/resolvers/profiles/ITextResolver.sol";
import "../../contracts/resolvers/profiles/IAddrResolver.sol";
import "../../contracts/resolvers/profiles/IAddressResolver.sol";
import "../../contracts/resolvers/profiles/INameResolver.sol";
import "../../contracts/reverseRegistrar/DefaultReverseRegistrar.sol";
import "../../contracts/utils/NameCoder.sol";

/**
 * @title TestDefaultReverseResolver
 * @dev Tests for DefaultReverseResolver - reverse resolution with default coin type validation
 */
contract TestDefaultReverseResolver is Test {
    DefaultReverseResolver public defaultReverseResolver;
    DefaultReverseRegistrar public defaultReverseRegistrar;

    // Test accounts
    address public OWNER;
    address public USER;

    // Test data
    string constant TEST_NAME = "test.eth";
    uint256 constant DEFAULT_COIN_TYPE = 0x80000000; // Default coin type
    uint256 constant ETH_COIN_TYPE = 60; // Ethereum

    // Events
    event NameForAddrChanged(address indexed addr, string name);

    function setUp() public {
        OWNER = vm.addr(1);
        USER = vm.addr(2);

        vm.startPrank(OWNER);

        // Deploy contracts
        defaultReverseRegistrar = new DefaultReverseRegistrar();
        defaultReverseResolver = new DefaultReverseResolver(
            defaultReverseRegistrar
        );

        vm.stopPrank();
    }

    function testSupportsInterface() public view {
        // Check ERC165 support
        assertTrue(
            defaultReverseResolver.supportsInterface(0x01ffc9a7),
            "Should support ERC165"
        );

        // Check IExtendedResolver support
        assertTrue(
            defaultReverseResolver.supportsInterface(
                type(IExtendedResolver).interfaceId
            ),
            "Should support IExtendedResolver"
        );

        // Check INameReverser support
        assertTrue(
            defaultReverseResolver.supportsInterface(
                type(INameReverser).interfaceId
            ),
            "Should support INameReverser"
        );
    }

    function testCoinType() public view {
        // Should return the default coin type
        assertEq(
            defaultReverseResolver.coinType(),
            DEFAULT_COIN_TYPE,
            "Should return default coin type"
        );
    }

    function testChainId() public view {
        // Default coin type maps to chain ID 0 according to ENSIP19.chainFromCoinType
        assertEq(
            defaultReverseResolver.chainId(),
            0,
            "Should return chain ID 0 for default coin type"
        );
    }

    function testResolveUnsupportedProfile() public {
        // Set up a name in the reverse registrar
        vm.startPrank(USER);
        defaultReverseRegistrar.setName(TEST_NAME);
        vm.stopPrank();

        // Create reverse name: {address}.addr.reverse
        string memory reverseName = string(
            abi.encodePacked(_toHexString(USER), ".addr.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);

        // Call an unsupported function (text record)
        bytes memory data = abi.encodeCall(
            ITextResolver.text,
            (bytes32(0), "description")
        );

        // Should revert with UnsupportedResolverProfile
        vm.expectRevert(
            abi.encodeWithSignature(
                "UnsupportedResolverProfile(bytes4)",
                bytes4(data)
            )
        );
        defaultReverseResolver.resolve(encodedName, data);
    }

    function testResolveDefaultReverseNamespace() public view {
        // Test resolving "default.reverse" should return the registrar address
        string memory namespaceName = "default.reverse";
        bytes memory encodedName = _dnsEncodeName(namespaceName);

        // Call addr(coinType) for default coin type
        bytes memory data = abi.encodeCall(
            IAddressResolver.addr,
            (bytes32(0), DEFAULT_COIN_TYPE)
        );

        bytes memory result = defaultReverseResolver.resolve(encodedName, data);
        // IAddressResolver.addr returns bytes, need to convert to address for EVM
        bytes memory addrBytes = abi.decode(result, (bytes));
        require(addrBytes.length == 20, "Address should be 20 bytes");
        address decodedAddr = address(bytes20(addrBytes));

        assertEq(
            decodedAddr,
            address(defaultReverseRegistrar),
            "Should return registrar address for default.reverse"
        );
    }

    function testResolvePrimaryName() public {
        // Set up a name in the reverse registrar
        vm.startPrank(USER);
        defaultReverseRegistrar.setName(TEST_NAME);
        vm.stopPrank();

        // Create reverse name: {address}.addr.reverse
        string memory reverseName = string(
            abi.encodePacked(_toHexString(USER), ".addr.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);

        // Call name() to get primary name
        bytes memory data = abi.encodeCall(INameResolver.name, (bytes32(0)));

        bytes memory result = defaultReverseResolver.resolve(encodedName, data);
        string memory decodedName = abi.decode(result, (string));

        assertEq(decodedName, TEST_NAME, "Should return the set primary name");
    }

    function testResolveUnreachableNameForNonEVMCoinType() public {
        // Set up a name in the reverse registrar
        vm.startPrank(USER);
        defaultReverseRegistrar.setName(TEST_NAME);
        vm.stopPrank();

        // Create reverse name with non-EVM coin type: {address}.0.reverse (Bitcoin)
        string memory reverseName = string(
            abi.encodePacked(_toHexString(USER), ".0.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);

        // Call name() for non-EVM coin type
        bytes memory data = abi.encodeCall(INameResolver.name, (bytes32(0)));

        // Should revert with UnreachableName for non-EVM coin types
        vm.expectRevert(
            abi.encodeWithSignature("UnreachableName(bytes)", encodedName)
        );
        defaultReverseResolver.resolve(encodedName, data);
    }

    function testResolveEVMCoinTypeETH() public {
        // Set up a name in the reverse registrar
        vm.startPrank(USER);
        defaultReverseRegistrar.setName(TEST_NAME);
        vm.stopPrank();

        // Create reverse name with ETH coin type: {address}.3c.reverse (ETH = 60 = 0x3c)
        string memory reverseName = string(
            abi.encodePacked(_toHexString(USER), ".3c.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);

        // Call name() for ETH coin type
        bytes memory data = abi.encodeCall(INameResolver.name, (bytes32(0)));

        bytes memory result = defaultReverseResolver.resolve(encodedName, data);
        string memory decodedName = abi.decode(result, (string));

        assertEq(
            decodedName,
            TEST_NAME,
            "Should return the set primary name for ETH coin type"
        );
    }

    function testResolveNames() public {
        // Set up names for multiple users
        address user1 = vm.addr(10);
        address user2 = vm.addr(11);
        address user3 = vm.addr(12);

        vm.startPrank(user1);
        defaultReverseRegistrar.setName("user1.eth");
        vm.stopPrank();

        vm.startPrank(user2);
        defaultReverseRegistrar.setName("user2.eth");
        vm.stopPrank();

        // user3 has no name set

        // Query multiple addresses
        address[] memory addresses = new address[](4);
        addresses[0] = user1;
        addresses[1] = user2;
        addresses[2] = user3;
        addresses[3] = address(0x999); // Another unset address

        string[] memory names = defaultReverseResolver.resolveNames(
            addresses,
            0
        );

        assertEq(names.length, 4, "Should return array of same length");
        assertEq(names[0], "user1.eth", "Should return user1's name");
        assertEq(names[1], "user2.eth", "Should return user2's name");
        assertEq(names[2], "", "Should return empty string for unset user3");
        assertEq(names[3], "", "Should return empty string for unset address");
    }

    function testResolveNamesEmpty() public view {
        address[] memory addresses = new address[](0);
        string[] memory names = defaultReverseResolver.resolveNames(
            addresses,
            0
        );

        assertEq(names.length, 0, "Should return empty array for empty input");
    }

    function testNamespaceEdgeCases() public {
        // Set up a name in the reverse registrar
        vm.startPrank(USER);
        defaultReverseRegistrar.setName(TEST_NAME);
        vm.stopPrank();

        // Test various valid namespace formats for ETH (coin type 60 = 0x3c)
        string[5] memory namespaces = [
            "3c.reverse", // Standard hex
            "03c.reverse", // Padded hex
            "000000000000000000000000000000000000000000000000000000000000003c.reverse", // Full 32-byte hex
            "80000000.reverse", // Default coin type
            "80000001.reverse" // Chain 1
        ];

        for (uint i = 0; i < namespaces.length; i++) {
            string memory reverseName = string(
                abi.encodePacked(_toHexString(USER), ".", namespaces[i])
            );
            bytes memory encodedName = _dnsEncodeName(reverseName);

            // Call name() function
            bytes memory data = abi.encodeCall(
                INameResolver.name,
                (bytes32(0))
            );

            bytes memory result = defaultReverseResolver.resolve(
                encodedName,
                data
            );
            string memory decodedName = abi.decode(result, (string));

            assertEq(
                decodedName,
                TEST_NAME,
                string(
                    abi.encodePacked(
                        "Should resolve name for namespace: ",
                        namespaces[i]
                    )
                )
            );
        }
    }

    // Helper function to convert address to hex string (without 0x prefix)
    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(40);
        for (uint256 i = 0; i < 20; i++) {
            bytes1 b = bytes1(
                uint8(uint256(uint160(addr)) / (2 ** (8 * (19 - i))))
            );
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            buffer[2 * i] = _char(hi);
            buffer[2 * i + 1] = _char(lo);
        }
        return string(buffer);
    }

    function _char(bytes1 b) internal pure returns (bytes1) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }

    // Helper function to DNS encode a name
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
                encoded[encodedIndex] = bytes1(uint8(labelLength));
                encodedIndex++;

                for (uint256 j = labelStart; j < i; j++) {
                    encoded[encodedIndex] = nameBytes[j];
                    encodedIndex++;
                }

                labelStart = i + 1;
            }
        }

        encoded[encodedIndex] = 0x00; // Null terminator

        // Resize to actual length
        bytes memory result = new bytes(encodedIndex + 1);
        for (uint256 i = 0; i <= encodedIndex; i++) {
            result[i] = encoded[i];
        }

        return result;
    }
}
