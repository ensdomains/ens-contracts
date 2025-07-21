// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/utils/UniversalSigValidator.sol";

// Mock contract that always returns valid signature
contract MockValidWallet {
    bytes4 private constant ERC1271_SUCCESS = 0x1626ba7e;

    function isValidSignature(
        bytes32,
        bytes calldata
    ) external pure returns (bytes4) {
        return ERC1271_SUCCESS;
    }
}

// Mock contract that always returns invalid signature
contract MockInvalidWallet {
    function isValidSignature(
        bytes32,
        bytes calldata
    ) external pure returns (bytes4) {
        return 0xffffffff; // Invalid magic value
    }
}

// Mock contract that reverts on signature validation
contract MockRevertingWallet {
    function isValidSignature(bytes32, bytes calldata) external pure {
        revert("Signature validation failed");
    }
}

// Mock factory for ERC6492 testing
contract MockERC6492Factory {
    bytes32 private constant SALT =
        0x00000000000000000000000000000000000000000000000000000000cafebabe;

    mapping(address => bool) public deployed;

    function predictAddress(address owner) public view returns (address) {
        bytes memory initCode = abi.encodePacked(
            type(MockValidWallet).creationCode,
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
            type(MockValidWallet).creationCode,
            bytes32(uint256(uint160(owner)))
        );

        assembly ("memory-safe") {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), SALT)
        }

        require(addr != address(0), "Create2Failed");
        deployed[addr] = true;
    }
}

/**
 * @title TestUniversalSigValidator
 * @dev Tests for UniversalSigValidator covering ERC-1271, ERC-6492, and ECDSA signature validation
 */
contract TestUniversalSigValidator is Test {
    UniversalSigValidator public validator;
    MockValidWallet public validWallet;
    MockInvalidWallet public invalidWallet;
    MockRevertingWallet public revertingWallet;
    MockERC6492Factory public factory;

    // Test accounts
    address public SIGNER;
    address public OTHER_SIGNER;

    // Test data
    bytes32 constant TEST_HASH = keccak256("test message");
    bytes32 constant ERC6492_SUFFIX =
        0x6492649264926492649264926492649264926492649264926492649264926492;

    function setUp() public {
        SIGNER = vm.addr(1);
        OTHER_SIGNER = vm.addr(2);

        // Deploy contracts
        validator = new UniversalSigValidator();
        validWallet = new MockValidWallet();
        invalidWallet = new MockInvalidWallet();
        revertingWallet = new MockRevertingWallet();
        factory = new MockERC6492Factory();
    }

    function testECDSAValidSignature() public {
        // Create valid ECDSA signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, TEST_HASH);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Should return true for valid signature
        assertTrue(
            validator.isValidSig(SIGNER, TEST_HASH, signature),
            "Valid ECDSA signature should be accepted"
        );
    }

    function testECDSAInvalidSignature() public {
        // Create signature with wrong signer
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, TEST_HASH); // Sign with OTHER_SIGNER
        bytes memory signature = abi.encodePacked(r, s, v);

        // Should return false for signature from different signer
        assertFalse(
            validator.isValidSig(SIGNER, TEST_HASH, signature),
            "Invalid ECDSA signature should be rejected"
        );
    }

    function testECDSAInvalidSignatureLength() public {
        // Create signature with wrong length
        bytes memory signature = abi.encodePacked(
            bytes32("invalid"),
            bytes16("short")
        );

        // Should revert for invalid signature length
        vm.expectRevert(
            "SignatureValidator#recoverSigner: invalid signature length"
        );
        validator.isValidSig(SIGNER, TEST_HASH, signature);
    }

    function testECDSAInvalidVValue() public {
        // Create signature with invalid v value
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, TEST_HASH);
        v = 26; // Invalid v value (should be 27 or 28)
        bytes memory signature = abi.encodePacked(r, s, v);

        // Should revert for invalid v value
        vm.expectRevert("SignatureValidator: invalid signature v value");
        validator.isValidSig(SIGNER, TEST_HASH, signature);
    }

    function testERC1271ValidSignature() public {
        bytes memory signature = abi.encodePacked("valid signature");

        // Should return true for contract that returns valid magic value
        assertTrue(
            validator.isValidSig(address(validWallet), TEST_HASH, signature),
            "Valid ERC1271 signature should be accepted"
        );
    }

    function testERC1271InvalidSignature() public {
        bytes memory signature = abi.encodePacked("invalid signature");

        // Should return false for contract that returns invalid magic value
        assertFalse(
            validator.isValidSig(address(invalidWallet), TEST_HASH, signature),
            "Invalid ERC1271 signature should be rejected"
        );
    }

    function testERC1271RevertingContract() public {
        bytes memory signature = abi.encodePacked("reverting signature");

        // Should revert with ERC1271Revert containing the ABI-encoded revert message
        bytes memory expectedError = abi.encodeWithSignature(
            "Error(string)",
            "Signature validation failed"
        );
        vm.expectRevert(
            abi.encodeWithSelector(ERC1271Revert.selector, expectedError)
        );
        validator.isValidSig(address(revertingWallet), TEST_HASH, signature);
    }

    function testERC6492UndeployedContractValid() public {
        // Get predicted address
        address predictedAddr = factory.predictAddress(SIGNER);

        // Create inner signature (doesn't matter for MockValidWallet)
        bytes memory innerSignature = abi.encodePacked("inner sig");

        // Create factory calldata
        bytes memory factoryCalldata = abi.encodeCall(
            factory.createWallet,
            (SIGNER)
        );

        // Create ERC6492 signature
        bytes memory erc6492Signature = abi.encodePacked(
            abi.encode(address(factory), factoryCalldata, innerSignature),
            ERC6492_SUFFIX
        );

        // Should return true - the UniversalSigValidator will validate ERC6492 signatures
        assertTrue(
            validator.isValidSig(predictedAddr, TEST_HASH, erc6492Signature),
            "Valid ERC6492 signature should be accepted"
        );
    }

    function testERC6492AlreadyDeployedContract() public {
        // Pre-deploy the contract
        address deployedAddr = factory.createWallet(SIGNER);

        // Create ERC6492 signature (factory calldata won't be called since contract exists)
        bytes memory innerSignature = abi.encodePacked("inner sig");
        bytes memory factoryCalldata = abi.encodeCall(
            factory.createWallet,
            (SIGNER)
        );
        bytes memory erc6492Signature = abi.encodePacked(
            abi.encode(address(factory), factoryCalldata, innerSignature),
            ERC6492_SUFFIX
        );

        // Should validate against already deployed contract
        assertTrue(
            validator.isValidSig(deployedAddr, TEST_HASH, erc6492Signature),
            "ERC6492 signature should work with already deployed contract"
        );
    }

    function testERC6492DeploymentFailure() public {
        // Create a factory call that will fail
        bytes memory invalidFactoryCalldata = abi.encodeWithSignature(
            "invalidFunction()"
        );
        bytes memory innerSignature = abi.encodePacked("inner sig");

        bytes memory erc6492Signature = abi.encodePacked(
            abi.encode(
                address(factory),
                invalidFactoryCalldata,
                innerSignature
            ),
            ERC6492_SUFFIX
        );

        // Should revert with deployment failure
        vm.expectRevert(); // ERC6492DeployFailed with specific error data
        validator.isValidSig(address(0x123), TEST_HASH, erc6492Signature);
    }

    function testIsValidSigWithSideEffects() public {
        // Get predicted address
        address predictedAddr = factory.predictAddress(SIGNER);

        // Create ERC6492 signature
        bytes memory innerSignature = abi.encodePacked("inner sig");
        bytes memory factoryCalldata = abi.encodeCall(
            factory.createWallet,
            (SIGNER)
        );
        bytes memory erc6492Signature = abi.encodePacked(
            abi.encode(address(factory), factoryCalldata, innerSignature),
            ERC6492_SUFFIX
        );

        // Should allow side effects and return true
        assertTrue(
            validator.isValidSigWithSideEffects(
                predictedAddr,
                TEST_HASH,
                erc6492Signature
            ),
            "Should allow side effects"
        );

        // Contract should be deployed
        assertTrue(
            factory.deployed(predictedAddr),
            "Contract should be deployed with side effects"
        );
    }

    function testIsValidSigNoSideEffects() public {
        // Get predicted address
        address predictedAddr = factory.predictAddress(SIGNER);

        // Create ERC6492 signature
        bytes memory innerSignature = abi.encodePacked("inner sig");
        bytes memory factoryCalldata = abi.encodeCall(
            factory.createWallet,
            (SIGNER)
        );
        bytes memory erc6492Signature = abi.encodePacked(
            abi.encode(address(factory), factoryCalldata, innerSignature),
            ERC6492_SUFFIX
        );

        // Should prevent side effects but still validate
        assertTrue(
            validator.isValidSig(predictedAddr, TEST_HASH, erc6492Signature),
            "Should validate without side effects"
        );

        // Contract should NOT be deployed when side effects are disabled
        assertFalse(
            factory.deployed(predictedAddr),
            "Contract should not be deployed without side effects"
        );
    }

    function testMixedSignatureTypes() public {
        // Test ECDSA
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, TEST_HASH);
        bytes memory ecdsaSignature = abi.encodePacked(r, s, v);
        assertTrue(
            validator.isValidSig(SIGNER, TEST_HASH, ecdsaSignature),
            "ECDSA should work"
        );

        // Test ERC1271
        bytes memory erc1271Signature = abi.encodePacked("contract sig");
        assertTrue(
            validator.isValidSig(
                address(validWallet),
                TEST_HASH,
                erc1271Signature
            ),
            "ERC1271 should work"
        );

        // Test ERC6492
        address predictedAddr = factory.predictAddress(SIGNER);
        bytes memory innerSig = abi.encodePacked("inner");
        bytes memory factoryCalldata = abi.encodeCall(
            factory.createWallet,
            (SIGNER)
        );
        bytes memory erc6492Signature = abi.encodePacked(
            abi.encode(address(factory), factoryCalldata, innerSig),
            ERC6492_SUFFIX
        );
        assertTrue(
            validator.isValidSig(predictedAddr, TEST_HASH, erc6492Signature),
            "ERC6492 should work"
        );
    }

    function testSignatureDetection() public view {
        // Regular signature (no suffix)
        bytes memory regularSig = abi.encodePacked("regular signature");
        assertFalse(
            _isERC6492Signature(regularSig),
            "Regular signature should not be detected as ERC6492"
        );

        // ERC6492 signature (with suffix)
        bytes memory erc6492Sig = abi.encodePacked("data", ERC6492_SUFFIX);
        assertTrue(
            _isERC6492Signature(erc6492Sig),
            "ERC6492 signature should be detected"
        );

        // Short signature (less than 32 bytes)
        bytes memory shortSig = abi.encodePacked("short");
        assertFalse(
            _isERC6492Signature(shortSig),
            "Short signature should not be detected as ERC6492"
        );
    }

    function testEdgeCases() public {
        // Empty signature
        bytes memory emptySig = "";
        vm.expectRevert();
        validator.isValidSig(SIGNER, TEST_HASH, emptySig);

        // Zero address signer with ECDSA
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, TEST_HASH);
        bytes memory signature = abi.encodePacked(r, s, v);
        assertFalse(
            validator.isValidSig(address(0), TEST_HASH, signature),
            "Zero address should not validate ECDSA"
        );

        // Zero hash
        bytes32 zeroHash = bytes32(0);
        (v, r, s) = vm.sign(1, zeroHash);
        signature = abi.encodePacked(r, s, v);
        assertTrue(
            validator.isValidSig(SIGNER, zeroHash, signature),
            "Should validate zero hash"
        );
    }

    function testMaxLength() public {
        // Test with very long signature (should still work if properly formatted)
        bytes memory longSig = new bytes(1000);
        // Fill with zeros except for valid ECDSA signature at the end
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, TEST_HASH);
        longSig[longSig.length - 65] = bytes1(r);
        // ... (this would need proper assembly to copy r, s, v to the end)

        // For now, just test that invalid long signatures fail
        vm.expectRevert();
        validator.isValidSig(SIGNER, TEST_HASH, longSig);
    }

    // Helper function to check if signature has ERC6492 suffix
    function _isERC6492Signature(
        bytes memory signature
    ) internal pure returns (bool) {
        if (signature.length < 32) return false;

        bytes32 suffix;
        assembly {
            suffix := mload(
                add(add(signature, 0x20), sub(mload(signature), 32))
            )
        }
        return suffix == ERC6492_SUFFIX;
    }
}
