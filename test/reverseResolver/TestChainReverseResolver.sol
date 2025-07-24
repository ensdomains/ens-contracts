// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/reverseResolver/ChainReverseResolver.sol";
import "../../contracts/reverseResolver/INameReverser.sol";
import "../../contracts/reverseRegistrar/L2ReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/DefaultReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/IStandaloneReverseRegistrar.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";
import "../../contracts/resolvers/profiles/INameResolver.sol";
import "../../contracts/resolvers/profiles/IAddrResolver.sol";
import "../../contracts/resolvers/profiles/ITextResolver.sol";
import "../../contracts/utils/ENSIP19.sol";
import "../../contracts/utils/UniversalSigValidator.sol";
import "../../node_modules/@unruggable/gateways/contracts/GatewayFetchTarget.sol";
import "../../node_modules/@unruggable/gateways/contracts/GatewayFetcher.sol";
import "../../node_modules/@unruggable/gateways/contracts/IGatewayVerifier.sol";
import "../../node_modules/@unruggable/gateways/contracts/GatewayRequest.sol";

/**
 * @title MockGatewayVerifier
 * @dev Mock implementation of IGatewayVerifier for testing CCIP-Read functionality
 */
contract MockGatewayVerifier is IGatewayVerifier {
    string[] private _gatewayURLs;

    constructor() {
        _gatewayURLs.push("http://localhost:8080");
    }

    function getLatestContext() external pure returns (bytes memory) {
        return
            hex"0000000000000000000000000000000000000000000000000000000000000001";
    }

    function gatewayURLs() external view returns (string[] memory) {
        return _gatewayURLs;
    }

    function getStorageValues(
        bytes memory,
        GatewayRequest memory,
        bytes memory
    ) external pure returns (bytes[] memory values, uint8 exitCode) {
        values = new bytes[](1);
        values[0] = abi.encode("");
        exitCode = 0;
    }
}

/**
 * @title TestChainReverseResolver
 * @dev Tests for ChainReverseResolver that handles L2 chain reverse resolution via CCIP-Read
 */
contract TestChainReverseResolver is Test {
    ChainReverseResolver public chainReverseResolver;
    L2ReverseRegistrar public l2ReverseRegistrar;
    DefaultReverseRegistrar public defaultReverseRegistrar;
    UniversalSigValidator public universalSigValidator;

    IGatewayVerifier public gatewayVerifier;
    string[] public gatewayURLs;

    address public constant OWNER = address(0x3);
    address public USER;
    address public RELAYER;

    uint256 public constant TEST_COIN_TYPE = (1 << 31) | 12345;
    uint256 public constant TEST_CHAIN_ID = 12345;
    string constant TEST_NAME = "test.eth";
    string constant FALLBACK_NAME = "fallback.eth";

    event GatewayVerifierChanged(address verifier);
    event GatewayURLsChanged(string[] urls);

    function setUp() public {
        USER = vm.addr(1);
        RELAYER = vm.addr(2);

        vm.startPrank(OWNER);

        universalSigValidator = new UniversalSigValidator();
        address expectedValidatorAddress = 0x164af34fAF9879394370C7f09064127C043A35E9;
        vm.etch(expectedValidatorAddress, address(universalSigValidator).code);

        l2ReverseRegistrar = new L2ReverseRegistrar(TEST_COIN_TYPE);
        defaultReverseRegistrar = new DefaultReverseRegistrar();

        _setupGatewayInfrastructure();

        chainReverseResolver = new ChainReverseResolver(
            OWNER,
            TEST_COIN_TYPE,
            defaultReverseRegistrar,
            address(l2ReverseRegistrar),
            gatewayVerifier,
            gatewayURLs
        );

        vm.stopPrank();
    }

    function _setupGatewayInfrastructure() internal {
        gatewayURLs = new string[](1);
        gatewayURLs[0] = "http://localhost:8080";

        MockGatewayVerifier mockVerifier = new MockGatewayVerifier();
        gatewayVerifier = IGatewayVerifier(address(mockVerifier));
    }

    function testSupportsInterface() public view {
        assertTrue(
            chainReverseResolver.supportsInterface(0x01ffc9a7),
            "Should support ERC165"
        );
        assertTrue(
            chainReverseResolver.supportsInterface(
                type(IExtendedResolver).interfaceId
            ),
            "Should support IExtendedResolver"
        );
        assertTrue(
            chainReverseResolver.supportsInterface(
                type(INameReverser).interfaceId
            ),
            "Should support INameReverser"
        );
    }

    function testCoinType() public view {
        assertEq(
            chainReverseResolver.coinType(),
            TEST_COIN_TYPE,
            "Should return correct coin type"
        );
    }

    function testChainId() public view {
        assertEq(
            chainReverseResolver.chainId(),
            TEST_CHAIN_ID,
            "Should return correct chain ID"
        );
    }

    function testDefaultRegistrar() public view {
        assertEq(
            address(chainReverseResolver.defaultRegistrar()),
            address(defaultReverseRegistrar),
            "Should return default registrar address"
        );
    }

    function testL2Registrar() public view {
        assertEq(
            chainReverseResolver.l2Registrar(),
            address(l2ReverseRegistrar),
            "Should return L2 registrar address"
        );
    }

    function testRevertUnsupportedProfile() public {
        string memory reverseName = "80003039.reverse";
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory textCall = abi.encodeWithSelector(
            ITextResolver.text.selector,
            _getNode(reverseName),
            "dne"
        );

        vm.expectRevert(
            abi.encodeWithSignature(
                "UnsupportedResolverProfile(bytes4)",
                ITextResolver.text.selector
            )
        );
        chainReverseResolver.resolve(encodedName, textCall);
    }

    function testResolveRegistrarAddress() public {
        string memory coinReverseNode = "80003039.reverse";
        bytes memory encodedName = _dnsEncodeName(coinReverseNode);
        bytes memory addrCall = abi.encodeWithSelector(
            IAddrResolver.addr.selector,
            _getNode(coinReverseNode)
        );

        bytes memory result = chainReverseResolver.resolve(
            encodedName,
            addrCall
        );
        address resolvedAddr = abi.decode(result, (address));
        assertEq(
            resolvedAddr,
            address(0),
            "Should resolve to address(0) for L2 coin type namespace addr query"
        );
    }

    function testResolveNameUnset() public {
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".80003039.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            _getNode(reverseName)
        );

        vm.expectRevert();
        chainReverseResolver.resolve(encodedName, nameCall);
    }

    function testResolveNameCallbackUnset() public {
        bytes[] memory values = new bytes[](1);
        values[0] = "";

        bytes memory extraData = abi.encode(USER);

        bytes memory result = chainReverseResolver.resolveNameCallback(
            values,
            0,
            extraData
        );
        string memory resolvedName = abi.decode(result, (string));

        assertEq(
            resolvedName,
            "",
            "Should resolve to empty string when no name is set"
        );
    }

    function testResolveNameFromL2() public {
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".80003039.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            _getNode(reverseName)
        );

        vm.expectRevert();
        chainReverseResolver.resolve(encodedName, nameCall);
    }

    function testResolveNameCallbackFromL2() public {
        bytes[] memory values = new bytes[](1);
        values[0] = bytes(TEST_NAME);

        bytes memory extraData = abi.encode(USER);

        bytes memory result = chainReverseResolver.resolveNameCallback(
            values,
            0,
            extraData
        );
        string memory resolvedName = abi.decode(result, (string));

        assertEq(
            resolvedName,
            TEST_NAME,
            "Should resolve name from L2 registrar"
        );
    }

    function testResolveNameFromDefault() public {
        string memory reverseName = string(
            abi.encodePacked(_addressToHex(USER), ".80003039.reverse")
        );
        bytes memory encodedName = _dnsEncodeName(reverseName);
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            _getNode(reverseName)
        );

        vm.expectRevert();
        chainReverseResolver.resolve(encodedName, nameCall);
    }

    function testResolveNameCallbackFromDefault() public {
        vm.startPrank(USER);
        defaultReverseRegistrar.setName(FALLBACK_NAME);
        vm.stopPrank();

        bytes[] memory values = new bytes[](1);
        values[0] = "";

        bytes memory extraData = abi.encode(USER);

        bytes memory result = chainReverseResolver.resolveNameCallback(
            values,
            0,
            extraData
        );
        string memory resolvedName = abi.decode(result, (string));

        assertEq(
            resolvedName,
            FALLBACK_NAME,
            "Should resolve name from default registrar as fallback"
        );
    }

    function testResolveNamesEmpty() public view {
        address[] memory addrs = new address[](0);
        string[] memory names = chainReverseResolver.resolveNames(addrs, 0);

        assertEq(names.length, 0, "Should return empty array for empty input");
    }

    function testResolveNamesMixed() public {
        address[] memory addrs = new address[](3);
        addrs[0] = USER;
        addrs[1] = RELAYER;
        addrs[2] = OWNER;

        vm.prank(USER);
        l2ReverseRegistrar.setName(TEST_NAME);

        vm.prank(RELAYER);
        defaultReverseRegistrar.setName(FALLBACK_NAME);

        vm.mockCall(
            address(chainReverseResolver),
            abi.encodeWithSelector(
                ChainReverseResolver.resolveNamesCallback.selector
            ),
            abi.encode(new string[](3))
        );

        string[] memory names = chainReverseResolver.resolveNames(addrs, 0);

        assertEq(names.length, 3, "Should return array of correct length");
    }

    function testSetGatewayVerifier() public {
        address newVerifier = address(0x999);

        vm.startPrank(OWNER);

        vm.expectEmit(true, true, true, true);
        emit GatewayVerifierChanged(newVerifier);

        chainReverseResolver.setGatewayVerifier(newVerifier);

        assertEq(
            address(chainReverseResolver.gatewayVerifier()),
            newVerifier,
            "Should update gateway verifier"
        );

        vm.stopPrank();
    }

    function testSetGatewayURLs() public {
        string[] memory newURLs = new string[](2);
        newURLs[0] = "http://localhost:8081";
        newURLs[1] = "http://localhost:8082";

        vm.startPrank(OWNER);

        vm.expectEmit(true, true, true, true);
        emit GatewayURLsChanged(newURLs);

        chainReverseResolver.setGatewayURLs(newURLs);

        assertEq(
            chainReverseResolver.gatewayURLs(0),
            newURLs[0],
            "Should update first gateway URL"
        );
        assertEq(
            chainReverseResolver.gatewayURLs(1),
            newURLs[1],
            "Should update second gateway URL"
        );

        vm.stopPrank();
    }

    function testRevertNonOwnerSetGatewayVerifier() public {
        vm.startPrank(USER);

        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", USER)
        );
        chainReverseResolver.setGatewayVerifier(address(0x999));

        vm.stopPrank();
    }

    function testRevertNonOwnerSetGatewayURLs() public {
        string[] memory newURLs = new string[](1);
        newURLs[0] = "http://localhost:8081";

        vm.startPrank(USER);

        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", USER)
        );
        chainReverseResolver.setGatewayURLs(newURLs);

        vm.stopPrank();
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
