// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {ENS} from "../registry/ENS.sol";
import {Controllable} from "../root/Controllable.sol";
import {AddressUtils} from "../utils/AddressUtils.sol";

import {IReverseRegistrar} from "./IReverseRegistrar.sol";
import {SignatureUtils} from "./SignatureUtils.sol";

interface INameSetterResolver {
    function setName(bytes32 node, string memory name) external;
}

/// @title ENS Reverse Registrar
/// @notice The registrar for reverse records on ENS
contract ReverseRegistrar is Ownable, Controllable, ERC165, IReverseRegistrar {
    using SignatureUtils for bytes;
    using ECDSA for bytes32;
    using AddressUtils for address;

    /// @dev `namehash('addr.reverse')`
    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;

    /// @notice The ENS registry
    ENS public immutable ens;

    /// @notice The default resolver
    INameSetterResolver public defaultResolver;

    /// @notice Sets the ENS registry and claims `addr.reverse`
    /// @param ensAddr The address of the ENS registry
    constructor(ENS ensAddr) {
        ens = ensAddr;

        // Assign ownership of the reverse record to our deployer
        ReverseRegistrar oldRegistrar = ReverseRegistrar(
            ensAddr.owner(ADDR_REVERSE_NODE)
        );
        if (address(oldRegistrar) != address(0x0)) {
            oldRegistrar.claim(msg.sender);
        }
    }

    /// @notice Modifier to check if the caller is authorised to perform an action.
    /// @param addr The address to check
    modifier authorised(address addr) {
        if (
            addr != msg.sender &&
            !controllers[msg.sender] &&
            !ens.isApprovedForAll(addr, msg.sender) &&
            !ownsContract(addr)
        ) {
            revert Unauthorised();
        }
        _;
    }

    /// @inheritdoc IReverseRegistrar
    function setDefaultResolver(address resolver) public override onlyOwner {
        if (address(resolver) == address(0)) revert ResolverAddressZero();
        defaultResolver = INameSetterResolver(resolver);
        emit DefaultResolverChanged(resolver);
    }

    /// @inheritdoc IReverseRegistrar
    function claim(address owner) public override returns (bytes32) {
        return claimForAddr(msg.sender, owner, address(defaultResolver));
    }

    /// @inheritdoc IReverseRegistrar
    function claimForAddr(
        address addr,
        address owner,
        address resolver
    ) public override authorised(addr) returns (bytes32) {
        bytes32 labelHash = addr.sha3HexAddress();
        bytes32 reverseNode = keccak256(
            abi.encodePacked(ADDR_REVERSE_NODE, labelHash)
        );
        emit ReverseClaimed(addr, reverseNode);
        ens.setSubnodeRecord(ADDR_REVERSE_NODE, labelHash, owner, resolver, 0);
        return reverseNode;
    }

    /// @inheritdoc IReverseRegistrar
    function claimForAddrWithSignature(
        address addr,
        address owner,
        address resolver,
        uint256 signatureExpiry,
        bytes memory signature
    ) public override returns (bytes32) {
        bytes32 labelHash = addr.sha3HexAddress();
        bytes32 reverseNode = keccak256(
            abi.encodePacked(ADDR_REVERSE_NODE, labelHash)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                IReverseRegistrar.claimForAddrWithSignature.selector,
                addr,
                owner,
                resolver,
                signatureExpiry
            )
        );

        bytes32 message = hash.toEthSignedMessageHash();

        signature.validateSignatureWithExpiry(addr, message, signatureExpiry);

        emit ReverseClaimed(addr, reverseNode);
        ens.setSubnodeRecord(ADDR_REVERSE_NODE, labelHash, owner, resolver, 0);
        return reverseNode;
    }

    /// @inheritdoc IReverseRegistrar
    function claimWithResolver(
        address owner,
        address resolver
    ) public override returns (bytes32) {
        return claimForAddr(msg.sender, owner, resolver);
    }

    /// @inheritdoc IReverseRegistrar
    function setName(string calldata name) public override returns (bytes32) {
        return
            setNameForAddr(
                msg.sender,
                msg.sender,
                address(defaultResolver),
                name
            );
    }

    /// @inheritdoc IReverseRegistrar
    function setNameForAddr(
        address addr,
        address owner,
        address resolver,
        string calldata name
    ) public override returns (bytes32) {
        bytes32 node = claimForAddr(addr, owner, resolver);
        INameSetterResolver(resolver).setName(node, name);
        return node;
    }

    /// @inheritdoc IReverseRegistrar
    function setNameForAddrWithSignature(
        address addr,
        address owner,
        address resolver,
        uint256 signatureExpiry,
        bytes memory signature,
        string calldata name
    ) public override returns (bytes32) {
        bytes32 node = claimForAddrWithSignature(
            addr,
            owner,
            resolver,
            signatureExpiry,
            signature
        );
        INameSetterResolver(resolver).setName(node, name);
        return node;
    }

    /// @inheritdoc IReverseRegistrar
    function node(address addr) public pure override returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(ADDR_REVERSE_NODE, addr.sha3HexAddress())
            );
    }

    /// @dev Checks if the provided address is a contract and is owned by the
    ///      caller.
    function ownsContract(address addr) internal view returns (bool) {
        if (addr.code.length == 0) return false;
        try Ownable(addr).owner() returns (address owner) {
            return owner == msg.sender;
        } catch (bytes memory /* lowLevelData */) {
            return false;
        }
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC165) returns (bool) {
        return
            interfaceID == type(IReverseRegistrar).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
