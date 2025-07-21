// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";
import {MessageHashUtils} from "@openzeppelin/contracts-v5/utils/cryptography/MessageHashUtils.sol";
import {ERC165} from "@openzeppelin/contracts-v5/utils/introspection/ERC165.sol";

import {IDefaultReverseRegistrar} from "./IDefaultReverseRegistrar.sol";
import {StandaloneReverseRegistrar} from "./StandaloneReverseRegistrar.sol";
import {SignatureUtils} from "./SignatureUtils.sol";
import {Controllable} from "../root/Controllable.sol";

/// @title Default Reverse Registrar
/// @notice A default reverse registrar. Only one instance of this contract is deployed.
contract DefaultReverseRegistrar is
    IDefaultReverseRegistrar,
    ERC165,
    StandaloneReverseRegistrar,
    Controllable
{
    using SignatureUtils for bytes;
    using MessageHashUtils for bytes32;

    /// @inheritdoc IDefaultReverseRegistrar
    function setName(string calldata name) external {
        _setName(msg.sender, name);
    }

    /// @inheritdoc IDefaultReverseRegistrar
    function setNameForAddrWithSignature(
        address addr,
        uint256 signatureExpiry,
        string calldata name,
        bytes calldata signature
    ) external {
        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                this.setNameForAddrWithSignature.selector,
                addr,
                signatureExpiry,
                name
            )
        ).toEthSignedMessageHash();

        signature.validateSignatureWithExpiry(addr, message, signatureExpiry);

        _setName(addr, name);
    }

    function setNameForAddr(
        address addr,
        string calldata name
    ) external onlyController {
        _setName(addr, name);
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC165, StandaloneReverseRegistrar) returns (bool) {
        return
            interfaceID == type(IDefaultReverseRegistrar).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
