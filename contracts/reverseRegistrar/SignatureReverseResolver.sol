// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {ENS} from "../registry/ENS.sol";
import {AddressUtils} from "../utils/AddressUtils.sol";

import {ISignatureReverseResolver} from "./ISignatureReverseResolver.sol";
import {SignatureUtils} from "./SignatureUtils.sol";

/// @notice A reverse resolver that allows setting names with signatures
contract SignatureReverseResolver is ISignatureReverseResolver, ERC165 {
    using SignatureUtils for bytes;
    using ECDSA for bytes32;
    using AddressUtils for address;

    mapping(bytes32 => string) names;

    bytes32 public immutable parentNode;
    uint256 public immutable coinType;

    /// @notice The caller is not authorised to perform the action
    error Unauthorised();

    /// @notice Sets the namespace and coin type
    /// @param _parentNode The namespace to set
    /// @param _coinType The coin type converted from the chain ID of the chain this contract is deployed to
    constructor(bytes32 _parentNode, uint256 _coinType) {
        parentNode = _parentNode;
        coinType = _coinType;
    }

    /// @dev Checks if the caller is authorised
    modifier authorised(address addr) {
        isAuthorised(addr);
        _;
    }

    /// @dev Checks if the caller is authorised
    function isAuthorised(address addr) internal view virtual {}

    /// @inheritdoc ISignatureReverseResolver
    function setNameForAddrWithSignature(
        address addr,
        string calldata name,
        uint256 signatureExpiry,
        bytes memory signature
    ) public returns (bytes32) {
        bytes32 node = _getNamehash(addr);

        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                ISignatureReverseResolver.setNameForAddrWithSignature.selector,
                name,
                addr,
                signatureExpiry,
                coinType
            )
        ).toEthSignedMessageHash();

        signature.validateSignatureWithExpiry(addr, message, signatureExpiry);

        _setName(addr, node, name);
        return node;
    }

    /// @dev Sets the name for an address
    function _setName(
        address addr,
        bytes32 node,
        string memory newName
    ) internal virtual {
        names[node] = newName;
        emit NameChanged(addr, node, newName);
    }

    /// @inheritdoc ISignatureReverseResolver
    function name(bytes32 node) public view returns (string memory) {
        return names[node];
    }

    /// @inheritdoc ISignatureReverseResolver
    function node(address addr) public view returns (bytes32) {
        return _getNamehash(addr);
    }

    /// @dev Gets the namehash for an address
    function _getNamehash(address addr) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, addr.sha3HexAddress()));
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(ISignatureReverseResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
