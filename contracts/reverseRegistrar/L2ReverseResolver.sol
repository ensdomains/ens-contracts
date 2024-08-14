// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../registry/ENS.sol";
import "../resolvers/profiles/INameResolver.sol";
import "../root/Controllable.sol";
import "../resolvers/Multicallable.sol";

import "./IL2ReverseResolver.sol";
import "./SignatureReverseResolver.sol";
import "./SignatureUtils.sol";

error NotOwnerOfContract();

/**
 * A L2 reverse resolver. Deployed to each L2 chain.
 */
contract L2ReverseResolver is
    Multicallable,
    IL2ReverseResolver,
    SignatureReverseResolver
{
    using SignatureUtils for bytes;
    using ECDSA for bytes32;

    bytes32 public immutable L2ReverseNode;

    /*
     * @dev Constructor
     * @param _L2ReverseNode The namespace to set. The converntion is '${coinType}.reverse'
     * @param _coinType The cointype converted from the chainId of the chain this contract is deployed to.
     */
    constructor(
        bytes32 _L2ReverseNode,
        uint256 _coinType
    ) SignatureReverseResolver(_L2ReverseNode, _coinType) {
        L2ReverseNode = _L2ReverseNode;
    }

    function isAuthorised(address addr) internal view override {
        if (addr != msg.sender && !ownsContract(addr, msg.sender)) {
            revert Unauthorised();
        }
    }

    /**
     * @dev Sets the name for a contract that is owned by a SCW using a signature
     * @param contractAddr The reverse node to set
     * @param owner The owner of the contract (via Ownable)
     * @param name The name of the reverse record
     * @param signatureExpiry Date when the signature expires
     * @param signature The signature of an address that will return true on isValidSignature for the owner
     * @return The ENS node hash of the reverse record.
     */
    function setNameForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string calldata name,
        uint256 signatureExpiry,
        bytes memory signature
    ) public returns (bytes32) {
        bytes32 node = _getNamehash(contractAddr);

        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        bytes32 message = keccak256(
            abi.encodePacked(
                address(this),
                IL2ReverseResolver
                    .setNameForAddrWithSignatureAndOwnable
                    .selector,
                name,
                contractAddr,
                owner,
                signatureExpiry,
                coinType
            )
        ).toEthSignedMessageHash();

        if (!ownsContract(contractAddr, owner)) {
            revert NotOwnerOfContract();
        }

        signature.validateSignatureWithExpiry(owner, message, signatureExpiry);

        _setName(node, name);
        emit ReverseClaimed(contractAddr, node);

        return node;
    }

    /**
     * @dev Sets the `name()` record for the reverse ENS record associated with
     * the calling account.
     * @param name The name to set for this address.
     * @return The ENS node hash of the reverse record.
     */
    function setName(string calldata name) public override returns (bytes32) {
        return setNameForAddr(msg.sender, name);
    }

    /**
     * @dev Sets the `name()` record for the reverse ENS record associated with
     * the addr provided account.
     * Can be used if the addr is a contract that is owned by a SCW.
     * @param name The name to set for this address.
     * @return The ENS node hash of the reverse record.
     */

    function setNameForAddr(
        address addr,
        string calldata name
    ) public authorised(addr) returns (bytes32) {
        bytes32 node = _getNamehash(addr);

        _setName(node, name);
        emit ReverseClaimed(addr, node);

        return node;
    }

    function ownsContract(
        address contractAddr,
        address addr
    ) internal view returns (bool) {
        try Ownable(contractAddr).owner() returns (address owner) {
            return owner == addr;
        } catch {
            return false;
        }
    }

    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        override(Multicallable, SignatureReverseResolver)
        returns (bool)
    {
        return
            interfaceID == type(IL2ReverseResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
