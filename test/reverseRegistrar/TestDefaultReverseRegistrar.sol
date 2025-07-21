// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/reverseRegistrar/DefaultReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/IDefaultReverseRegistrar.sol";
import "../../contracts/reverseRegistrar/IStandaloneReverseRegistrar.sol";
import "../../contracts/test/mocks/MockSmartContractWallet.sol";
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
 * @title TestDefaultReverseRegistrar
 * @dev Tests for DefaultReverseRegistrar signature-based reverse record setting
 */
contract TestDefaultReverseRegistrar is Test {
    DefaultReverseRegistrar public defaultReverseRegistrar;
    MockSmartContractWallet public mockSmartContractAccount;
    MockERC6492WalletFactory public mockErc6492WalletFactory;
    UniversalSigValidator public universalSigValidator;

    // Test accounts
    address public USER;
    address public RELAYER;
    address constant OWNER = address(0x3);

    // Test data
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
        defaultReverseRegistrar = new DefaultReverseRegistrar();
        mockSmartContractAccount = new MockSmartContractWallet(USER);
        mockErc6492WalletFactory = new MockERC6492WalletFactory();

        vm.stopPrank();
    }

    function testSimpleSignatureCall() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create raw message hash EXACTLY as DefaultReverseRegistrar does (before .toEthSignedMessageHash())
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME
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

        // Call without expectEmit to see what happens
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        // Verify name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "Name should be set for user via signature"
        );

        vm.stopPrank();
    }

    function testDebugSignature() public view {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Debug the addresses
        console.log("USER address:", USER);
        console.log("Private key 1 maps to:", vm.addr(1));
        console.log("Contract address:", address(defaultReverseRegistrar));
        console.log("signatureExpiry:", signatureExpiry);
        console.log("TEST_NAME:", TEST_NAME);

        // Create message hash exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        console.log(
            "Function selector:",
            uint256(bytes32(functionSelector) >> 224)
        );
        console.log("Function selector bytes:");
        console.logBytes(abi.encodePacked(functionSelector));

        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME
            )
        );
        console.log("Raw message hash:");
        console.logBytes32(rawMessage);

        // Debug: show exact packed data
        bytes memory packedData = abi.encodePacked(
            address(defaultReverseRegistrar),
            functionSelector,
            USER,
            signatureExpiry,
            TEST_NAME
        );
        console.log("Packed data:");
        console.logBytes(packedData);

        // Apply Ethereum signed message hash (what contract does)
        bytes32 ethSignedMessage = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );
        console.log("Eth signed message hash:");
        console.logBytes32(ethSignedMessage);

        // Test both signing approaches
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(1, rawMessage);
        console.log("Signing raw message - v:", v1);
        console.log(
            "Signing raw message - recovered:",
            ecrecover(rawMessage, v1, r1, s1)
        );
        console.log(
            "Signing raw message - recovered from eth signed:",
            ecrecover(ethSignedMessage, v1, r1, s1)
        );

        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(1, ethSignedMessage);
        console.log("Signing eth signed message - v:", v2);
        console.log(
            "Signing eth signed message - recovered:",
            ecrecover(ethSignedMessage, v2, r2, s2)
        );
        console.log(
            "Signing eth signed message - recovered from raw:",
            ecrecover(rawMessage, v2, r2, s2)
        );
    }

    function testSupportsInterface() public view {
        // Check ERC165 support
        assertTrue(
            defaultReverseRegistrar.supportsInterface(0x01ffc9a7),
            "Should support ERC165"
        );

        // Check IDefaultReverseRegistrar support
        assertTrue(
            defaultReverseRegistrar.supportsInterface(
                type(IDefaultReverseRegistrar).interfaceId
            ),
            "Should support IDefaultReverseRegistrar"
        );

        // Check IStandaloneReverseRegistrar support
        assertTrue(
            defaultReverseRegistrar.supportsInterface(
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

        defaultReverseRegistrar.setName(TEST_NAME);

        // Verify name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "Name should be set for user"
        );

        vm.stopPrank();
    }

    function testSetNameForAddrWithSignature() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create message hash exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME
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

        // Expect event emission
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER, TEST_NAME);

        // Set name with signature
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        // Verify name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "Name should be set for user via signature"
        );

        vm.stopPrank();
    }

    function testSetNameForAddrWithSignatureSmartContract() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create message hash for smart contract account exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                address(mockSmartContractAccount),
                signatureExpiry,
                TEST_NAME
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign message as USER (the owner of the smart contract wallet)
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Expect event emission
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(address(mockSmartContractAccount), TEST_NAME);

        // Set name with signature for smart contract
        defaultReverseRegistrar.setNameForAddrWithSignature(
            address(mockSmartContractAccount),
            signatureExpiry,
            TEST_NAME,
            signature
        );

        // Verify name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(
                address(mockSmartContractAccount)
            ),
            TEST_NAME,
            "Name should be set for smart contract via signature"
        );

        vm.stopPrank();
    }

    function testSetNameForAddrWithSignatureERC6492() public {
        // Get predicted address from factory
        address predictedAddress = mockErc6492WalletFactory.predictAddress(
            USER
        );
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create message hash for predicted address exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                predictedAddress,
                signatureExpiry,
                TEST_NAME
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign message as USER
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, ethSignedMessageHash);
        bytes memory innerSignature = abi.encodePacked(r, s, v);

        // Create ERC6492 wrapped signature
        bytes memory factoryCalldata = abi.encodeCall(
            mockErc6492WalletFactory.createWallet,
            (USER)
        );
        bytes memory wrappedSignature = abi.encodePacked(
            abi.encode(
                address(mockErc6492WalletFactory),
                factoryCalldata,
                innerSignature
            ),
            bytes32(
                0x6492649264926492649264926492649264926492649264926492649264926492
            )
        );

        vm.startPrank(RELAYER);

        // Expect event emission
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(predictedAddress, TEST_NAME);

        // Set name with ERC6492 signature
        defaultReverseRegistrar.setNameForAddrWithSignature(
            predictedAddress,
            signatureExpiry,
            TEST_NAME,
            wrappedSignature
        );

        // Verify name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(predictedAddress),
            TEST_NAME,
            "Name should be set for undeployed contract via ERC6492"
        );

        vm.stopPrank();
    }

    function testRevertInvalidSignature() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create WRONG message hash (parameters in wrong order)
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 wrongRawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                TEST_NAME, // Wrong order
                USER,
                signatureExpiry
            )
        );

        // Sign wrong message - vm.sign handles Ethereum signed message formatting
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, wrongRawMessage);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(RELAYER);

        // Should revert with InvalidSignature
        vm.expectRevert(abi.encodeWithSignature("InvalidSignature()"));
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        vm.stopPrank();
    }

    function testRevertSignatureExpired() public {
        uint256 signatureExpiry = 0; // Already expired

        // Create message hash exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME
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

        // Should revert with SignatureExpired
        vm.expectRevert(abi.encodeWithSignature("SignatureExpired()"));
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        vm.stopPrank();
    }

    function testRevertSignatureExpiryTooHigh() public {
        uint256 signatureExpiry = block.timestamp + 3601; // More than 1 hour (3600 seconds)

        // Create message hash exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME
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

        // Should revert with SignatureExpiryTooHigh
        vm.expectRevert(abi.encodeWithSignature("SignatureExpiryTooHigh()"));
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        vm.stopPrank();
    }

    function testMultipleNameChanges() public {
        vm.startPrank(USER);

        // Set initial name
        defaultReverseRegistrar.setName("initial.eth");
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            "initial.eth",
            "Initial name should be set"
        );

        // Change name
        defaultReverseRegistrar.setName("updated.eth");
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            "updated.eth",
            "Name should be updated"
        );

        // Clear name
        defaultReverseRegistrar.setName("");
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            "",
            "Name should be cleared"
        );

        vm.stopPrank();
    }

    function testNameForAddrDefault() public view {
        // Should return empty string for addresses with no name set
        assertEq(
            defaultReverseRegistrar.nameForAddr(address(0x999)),
            "",
            "Should return empty string for unset address"
        );
    }

    function testSignatureReplayProtection() public {
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create message hash exactly as DefaultReverseRegistrar does
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                USER,
                signatureExpiry,
                TEST_NAME
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

        // First use should work
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        // Second use should also work (DefaultReverseRegistrar doesn't implement replay protection - it just sets name again)
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature
        );

        vm.stopPrank();
    }

    function testDifferentAccountsCanUseSameSignature() public {
        address user2 = vm.addr(4);
        uint256 signatureExpiry = block.timestamp + SIGNATURE_VALIDITY;

        // Create signatures - each user signs for their own address
        bytes memory signature1 = _createSignatureForUser(
            USER,
            1,
            signatureExpiry
        ); // USER signs for USER
        bytes memory signature2 = _createSignatureForUser(
            user2,
            4,
            signatureExpiry
        ); // user2 signs for user2

        vm.startPrank(RELAYER);

        // Both should work - different users can set their own names with their own signatures
        defaultReverseRegistrar.setNameForAddrWithSignature(
            USER,
            signatureExpiry,
            TEST_NAME,
            signature1
        );

        defaultReverseRegistrar.setNameForAddrWithSignature(
            user2,
            signatureExpiry,
            TEST_NAME,
            signature2
        );

        // Verify both names were set
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            TEST_NAME,
            "User1 name should be set"
        );
        assertEq(
            defaultReverseRegistrar.nameForAddr(user2),
            TEST_NAME,
            "User2 name should be set"
        );

        vm.stopPrank();
    }

    function testEmptyNameAllowed() public {
        vm.startPrank(USER);

        // Set empty name (clearing)
        vm.expectEmit(true, false, false, true);
        emit NameForAddrChanged(USER, "");

        defaultReverseRegistrar.setName("");

        // Verify empty name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
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
        defaultReverseRegistrar.setName(longName);

        // Verify long name was set
        assertEq(
            defaultReverseRegistrar.nameForAddr(USER),
            longName,
            "Long name should be allowed"
        );

        vm.stopPrank();
    }

    // Helper function to create signature for a user (fixes stack too deep)
    function _createSignatureForUser(
        address user,
        uint256 privateKey,
        uint256 signatureExpiry
    ) internal view returns (bytes memory) {
        bytes4 functionSelector = defaultReverseRegistrar
            .setNameForAddrWithSignature
            .selector;
        bytes32 rawMessage = keccak256(
            abi.encodePacked(
                address(defaultReverseRegistrar),
                functionSelector,
                user,
                signatureExpiry,
                TEST_NAME
            )
        );

        // Apply Ethereum signed message hash (what contract does with .toEthSignedMessageHash())
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", rawMessage)
        );

        // Sign the Ethereum signed message hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            ethSignedMessageHash
        );
        return abi.encodePacked(r, s, v);
    }
}
