// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";
import {MessageHashUtils} from "@openzeppelin/contracts-v5/utils/cryptography/MessageHashUtils.sol";
import {ERC165} from "@openzeppelin/contracts-v5/utils/introspection/ERC165.sol";

import {IL2ReverseRegistrar} from "./IL2ReverseRegistrar.sol";
import {StandaloneReverseRegistrar} from "./StandaloneReverseRegistrar.sol";
import {SignatureUtils} from "./SignatureUtils.sol";

/// @title L2 Reverse Registrar
/// @notice An L2 Reverse Registrar. Deployed to each L2 chain.
contract L2ReverseRegistrar is
    IL2ReverseRegistrar,
    ERC165,
    StandaloneReverseRegistrar
{
    using SignatureUtils for bytes;
    using MessageHashUtils for bytes32;

    /// @notice The coin type for the chain this contract is deployed to.
    uint256 public immutable coinType;

    /// @notice Thrown when the specified address is not the owner of the contract
    error NotOwnerOfContract();

    /// @notice Thrown when the coin type is not found in the provided array
    error CoinTypeNotFound();

    /// @notice The caller is not authorised to perform the action
    error Unauthorised();

    /// @notice Checks if the caller is authorised
    ///
    /// @param addr The address to check.
    modifier authorised(address addr) {
        if (addr != msg.sender && !_ownsContract(addr, msg.sender)) {
            revert Unauthorised();
        }
        _;
    }

    /// @notice Ensures the coin type of the contract is included in the provided array
    ///
    /// @param coinTypes The coin types to check.
    modifier validCoinTypes(uint256[] calldata coinTypes) {
        _validateCoinTypes(coinTypes);
        _;
    }

    /// @notice Initialises the contract by setting the coin type.
    ///
    /// @param coinType_ The cointype converted from the chainId of the chain this contract is deployed to.
    constructor(uint256 coinType_) {
        coinType = coinType_;
    }

    /// @inheritdoc IL2ReverseRegistrar
    function setName(string calldata name) external authorised(msg.sender) {
        _setName(msg.sender, name);
    }

    /// @inheritdoc IL2ReverseRegistrar
    function setNameForAddr(
        address addr,
        string calldata name
    ) external authorised(addr) {
        _setName(addr, name);
    }

    /// @inheritdoc IL2ReverseRegistrar
    function setNameForAddrWithSignature(
        address addr,
        uint256 signatureExpiry,
        string calldata name,
        uint256[] calldata coinTypes,
        bytes calldata signature
    ) external validCoinTypes(coinTypes) {
        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                this.setNameForAddrWithSignature.selector,
                addr,
                signatureExpiry,
                name,
                coinTypes
            )
        ).toEthSignedMessageHash();

        signature.validateSignatureWithExpiry(addr, message, signatureExpiry);

        _setName(addr, name);
    }

    /// @inheritdoc IL2ReverseRegistrar
    function setNameForOwnableWithSignature(
        address contractAddr,
        address owner,
        uint256 signatureExpiry,
        string calldata name,
        uint256[] calldata coinTypes,
        bytes calldata signature
    ) external validCoinTypes(coinTypes) {
        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                this.setNameForOwnableWithSignature.selector,
                contractAddr,
                owner,
                signatureExpiry,
                name,
                coinTypes
            )
        ).toEthSignedMessageHash();

        if (!_ownsContract(contractAddr, owner)) revert NotOwnerOfContract();

        signature.validateSignatureWithExpiry(owner, message, signatureExpiry);

        _setName(contractAddr, name);
    }

    /// @notice Checks if the provided contractAddr is a contract and is owned by the
    ///         provided addr.
    ///
    /// @param contractAddr The address of the contract to check.
    /// @param addr The address to check ownership against.
    function _ownsContract(
        address contractAddr,
        address addr
    ) internal view returns (bool) {
        if (contractAddr.code.length == 0) return false;
        try Ownable(contractAddr).owner() returns (address owner) {
            return owner == addr;
        } catch {
            return false;
        }
    }

    /// @notice Ensures the coin type for the contract is included in the provided array.
    ///
    /// @param coinTypes The coin types to check.
    function _validateCoinTypes(uint256[] calldata coinTypes) internal view {
        for (uint256 i = 0; i < coinTypes.length; i++) {
            if (coinTypes[i] == coinType) return;
        }

        revert CoinTypeNotFound();
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC165, StandaloneReverseRegistrar) returns (bool) {
        return
            interfaceID == type(IL2ReverseRegistrar).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
