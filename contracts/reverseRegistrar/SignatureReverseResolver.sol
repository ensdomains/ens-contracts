// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {ENS} from "../registry/ENS.sol";
import {AddressUtils} from "../utils/AddressUtils.sol";

import {ISignatureReverseResolver} from "./ISignatureReverseResolver.sol";
import {SignatureUtils} from "./SignatureUtils.sol";

error Unauthorised();

contract SignatureReverseResolver is ISignatureReverseResolver, ERC165 {
    using SignatureUtils for bytes;
    using ECDSA for bytes32;
    using AddressUtils for address;

    mapping(bytes32 => string) names;

    bytes32 public immutable parentNode;
    uint256 public immutable coinType;

    /*
     * @dev Constructor
     * @param parentNode The namespace to set.
     * @param _coinType The coinType converted from the chainId of the chain this contract is deployed to.
     */
    constructor(bytes32 _parentNode, uint256 _coinType) {
        parentNode = _parentNode;
        coinType = _coinType;
    }

    modifier authorised(address addr) {
        isAuthorised(addr);
        _;
    }

    function isAuthorised(address addr) internal view virtual {}

    /**
     * @dev Sets the name for an addr using a signature that can be verified with ERC1271.
     * @param addr The reverse record to set
     * @param name The name of the reverse record
     * @param signatureExpiry Date when the signature expires
     * @param signature The resolver of the reverse node
     * @return The ENS node hash of the reverse record.
     */
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

        _setName(node, name);
        emit ReverseClaimed(addr, node);
        return node;
    }

    function _setName(bytes32 node, string memory newName) internal virtual {
        names[node] = newName;
        emit NameChanged(node, newName);
    }

    /**
     * Returns the name associated with an ENS node, for reverse records.
     * Defined in EIP181.
     * @param node The ENS node to query.
     * @return The associated name.
     */
    function name(bytes32 node) public view returns (string memory) {
        return names[node];
    }

    /**
     * @dev Returns the node hash for a given account's reverse records.
     * @param addr The address to hash
     * @return The ENS node hash.
     */
    function node(address addr) public view returns (bytes32) {
        return _getNamehash(addr);
    }

    function _getNamehash(address addr) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, addr.sha3HexAddress()));
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(ISignatureReverseResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
