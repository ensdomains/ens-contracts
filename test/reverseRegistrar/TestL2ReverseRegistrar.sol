// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/reverseRegistrar/L2ReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/IL2ReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/IStandaloneReverseRegistrar.sol";
import "../../contracts/test/mocks/MockSmartContractWallet.sol";
import "../../contracts/test/mocks/MockOwnable.sol";
import "../../contracts/utils/UniversalSigValidator.sol";

// Minimal mock for ERC6492 wallet factory to avoid import conflicts
contract MockERC6492WalletFactory {
    bytes32 private constant SALT =
        0x00000000000000000000000000000000000000000000000000000000cafebabe;

    function predictAddress(address owner) public view returns (address) {
        bytes memory initCode = abi.encodePacked(
            type(MockSmartContractWallet).creationCode,
            bytes32(uint256(uint160(owner)))
        );

        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                SALT,
                                keccak256(initCode)
                            )
                        )
                    )
                )
            );
    }

    function createWallet(address owner) public returns (address addr) {
        bytes memory bytecode = abi.encodePacked(
            type(MockSmartContractWallet).creationCode,
            bytes32(uint256(uint160(owner)))
        );

        assembly ("memory-safe") {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), SALT)
        }

        require(addr != address(0), "Create2Failed");
    }
}

/**
 * @title TestL2ReverseRegistrar
 * @dev Tests for L2ReverseRegistrar including signature-based reverse record setting with coin type validation
 */
contract TestL2ReverseRegistrar is Test {
    L2ReverseRegistrar public l2ReverseRegistrar;
    MockSmartContractWallet public mockSmartContractAccount;
    MockERC6492WalletFactory public mockErc6492WalletFactory;
    MockOwnable public mockOwnableEoa;
    MockOwnable public mockOwnableSca;
    UniversalSigValidator public universalSigValidator;

    // Test accounts
    address public USER;
    address public RELAYER;
    address constant OWNER = address(0x3);

    // Test data - using Optimism coin type (0x7FFFFFE)
    uint256 constant COIN_TYPE = 0x7FFFFFE; // 134217726 - Optimism
    string constant TEST_NAME = "myname.eth";
    uint256 constant SIGNATURE_VALIDITY = 1800; // 30 minutes (less than 1 hour)

    // Events
    event NameForAddrChanged(address indexed addr, string name);

    function setUp() public {
        // Set up test accounts using vm.addr for correct private key mapping
        USER = vm.addr(1);
        RELAYER = vm.addr(2);

        vm.startPrank(OWNER);

        // Deploy UniversalSigValidator first
        universalSigValidator = new UniversalSigValidator();

        // Deploy the UniversalSigValidator at the expected address that SignatureUtils references
        address expectedValidatorAddress = 0x164af34fAF9879394370C7f09064127C043A35E9;
        vm.etch(expectedValidatorAddress, address(universalSigValidator).code);

        // Deploy contracts
        l2ReverseRegistrar = new L2ReverseRegistrar(COIN_TYPE);
        mockSmartContractAccount = new MockSmartContractWallet(USER);
        mockErc6492WalletFactory = new MockERC6492WalletFactory();

        // Deploy Ownable contracts
        mockOwnableEoa = new MockOwnable(USER);
        mockOwnableSca = new MockOwnable(address(mockSmartContractAccount));

        vm.stopPrank();
    }

    function testSupportsInterface() public view {
        // Check ERC165 support
        assertTrue(
            l2ReverseRegistrar.supportsInterface(0x01ffc9a7),
            "Should support ERC165"
        );

        // Check IL2ReverseRegistrar support
        assertTrue(
            l2ReverseRegistrar.supportsInterface(
                type(IL2ReverseRegistrar).interfaceId
            ),
            "Should support IL2ReverseRegistrar"
        );

        // Check IStandaloneReverseRegistrar support
        assertTrue(
            l2ReverseRegistrar.supportsInterface(
                type(IStandaloneReverseRegistrar).interfaceId
            ),
            "Should support IStandaloneReverseRegistrar"
        );
    }

    function testSetName() public {
        vm.startPrank(USER);

        // Set name record
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER, TEST_NAME);

        l2ReverseRegistrar.setName(TEST_NAME);

        // Verify name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "Name should be set for user"
        );

        vm.stopPrank();
    }

    function testSetNameForAddr() public {
        vm.startPrank(USER);

        // Set name for target address (Ownable contract owned by USER)
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(address(mockOwnableEoa), TEST_NAME);

        l2ReverseRegistrar.setNameForAddr(address(mockOwnableEoa), TEST_NAME);

        // Verify name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(address(mockOwnableEoa)),
            TEST_NAME,
            "Name should be set for owned contract"
        );

        vm.stopPrank();
    }

    function testRevertSetNameForAddrUnauthorized() public {
        vm.startPrank(RELAYER); // Different user, not owner

        // Should revert when trying to set name for contract not owned by caller
        vm.expectRevert(abi.encodeWithSignature("Unauthorised()"));
        l2ReverseRegistrar.setNameForAddr(address(mockOwnableEoa), TEST_NAME);

        vm.stopPrank();
    }

    function testSetNameForAddrWithCoinTypeValidation() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](1);
        coinTypes[0] = COIN_TYPE;

        // Create message hash for L2ReverseRegistrar signature validation
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Set name with signature including coin type validation
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER, TEST_NAME);

        l2ReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        // Verify name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "Name should be set for user via signature"
        );

        vm.stopPrank();
    }

    function testRevertCoinTypeNotFound() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](2);
        coinTypes[0] = 123456; // Wrong coin type
        coinTypes[1] = 789012; // Wrong coin type

        // Create valid signature for the message
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Should revert because COIN_TYPE (Optimism) is not in the coinTypes array
        vm.expectRevert(abi.encodeWithSignature("CoinTypeNotFound()"));
        l2ReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        vm.stopPrank();
    }

    function testRevertEmptyCoinTypeArray() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](0); // Empty array

        // Create valid signature for the message
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Should revert because empty array doesn't contain required COIN_TYPE
        vm.expectRevert(abi.encodeWithSignature("CoinTypeNotFound()"));
        l2ReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        vm.stopPrank();
    }

    function testSetNameForAddrWithMultipleCoinTypes() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](4);
        coinTypes[0] = 34384;
        coinTypes[1] = 54842344;
        coinTypes[2] = 3498283;
        coinTypes[3] = COIN_TYPE; // Include the required coin type

        // Create valid signature for the message
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Should succeed because COIN_TYPE is included in the array
        l2ReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        // Verify name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "Name should be set with multiple coin types"
        );

        vm.stopPrank();
    }

    function testSetNameForOwnableWithSignature() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](1);
        coinTypes[0] = COIN_TYPE;

        // Create message hash for Ownable signature validation (different format)
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForOwnableWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                address(mockOwnableEoa), // target contract
                USER, // owner address
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Set name for Ownable contract using signature from owner
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(address(mockOwnableEoa), TEST_NAME);

        l2ReverseRegistrar.setNameForOwnableWithSignature(
            address(mockOwnableEoa),
            USER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        // Verify name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(address(mockOwnableEoa)),
            TEST_NAME,
            "Name should be set for Ownable contract"
        );

        vm.stopPrank();
    }

    function testRevertNotOwnerOfContract() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](1);
        coinTypes[0] = COIN_TYPE;

        // Create signature but claim wrong owner
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForOwnableWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                address(mockOwnableEoa), // target contract
                RELAYER, // wrong owner (should be USER)
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign with RELAYER's key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Should revert because RELAYER is not the owner of mockOwnableEoa
        vm.expectRevert(abi.encodeWithSignature("NotOwnerOfContract()"));
        l2ReverseRegistrar.setNameForOwnableWithSignature(
            address(mockOwnableEoa),
            RELAYER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        vm.stopPrank();
    }

    function testRevertTargetNotContract() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;
        uint256[] memory coinTypes = new uint256[](1);
        coinTypes[0] = COIN_TYPE;

        // Try to set name for EOA address instead of contract
        bytes4 functionSelector = l2ReverseRegistrar
            .setNameForOwnableWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(l2ReverseRegistrar),
                functionSelector,
                RELAYER, // EOA address, not a contract
                USER,
                signatureExpiry,
                TEST_NAME,
                coinTypes
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Should revert because target is not a contract
        vm.expectRevert(abi.encodeWithSignature("NotOwnerOfContract()"));
        l2ReverseRegistrar.setNameForOwnableWithSignature(
            RELAYER, // EOA
            USER,
            signatureExpiry,
            TEST_NAME,
            coinTypes,
            signature
        );

        vm.stopPrank();
    }

    function testNameForAddrDefault() public view {
        // Should return empty string for addresses with no name set
        assertEq(
            l2ReverseRegistrar.nameForAddr(address(0x999)),
            "",
            "Should return empty string for unset address"
        );
    }

    function testMultipleNameChanges() public {
        vm.startPrank(USER);

        // Set initial name
        l2ReverseRegistrar.setName("initial.eth");
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            "initial.eth",
            "Initial name should be set"
        );

        // Change name
        l2ReverseRegistrar.setName("updated.eth");
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            "updated.eth",
            "Name should be updated"
        );

        // Clear name
        l2ReverseRegistrar.setName("");
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            "",
            "Name should be cleared"
        );

        vm.stopPrank();
    }

    function testEmptyNameAllowed() public {
        vm.startPrank(USER);

        // Set empty name (clearing)
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER, "");

        l2ReverseRegistrar.setName("");

        // Verify empty name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            "",
            "Empty name should be allowed"
        );

        vm.stopPrank();
    }

    function testLongNameAllowed() public {
        string
            memory longName = "verylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongname.eth";

        vm.startPrank(USER);

        // Set long name
        l2ReverseRegistrar.setName(longName);

        // Verify long name was set
        assertEq(
            l2ReverseRegistrar.nameForAddr(USER),
            longName,
            "Long name should be allowed"
        );

        vm.stopPrank();
    }
}
