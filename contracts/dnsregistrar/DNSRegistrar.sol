//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@ensdomains/buffer/contracts/Buffer.sol";
import "../dnssec-oracle/DNSSEC.sol";
import "../dnssec-oracle/RRUtils.sol";
import "../registry/ENSRegistry.sol";
import "../root/Root.sol";
import "../resolvers/profiles/AddrResolver.sol";
import "../utils/BytesUtils.sol";
import "./DNSClaimChecker.sol";
import "./PublicSuffixList.sol";
import "./IDNSRegistrar.sol";
import {NameCoder} from "../utils/NameCoder.sol";

/// @dev An ENS registrar that allows the owner of a DNS name to claim the
///      corresponding name in ENS.
contract DNSRegistrar is IDNSRegistrar, IERC165 {
    using BytesUtils for bytes;
    using Buffer for Buffer.buffer;
    using RRUtils for *;

    ENS public immutable ens;
    DNSSEC public immutable oracle;
    PublicSuffixList public suffixes;
    address public immutable previousRegistrar;
    address public immutable resolver;
    // A mapping of the most recent signatures seen for each claimed domain.
    mapping(bytes32 node => uint32 time) public inceptions;

    error NoOwnerRecordFound();
    error PermissionDenied(address caller, address owner);
    error PreconditionNotMet();
    error StaleProof(bytes name, uint32 lastTime, uint32 time);
    error InvalidPublicSuffix(bytes name);

    struct OwnerRecord {
        bytes name;
        address owner;
        address resolver;
        uint64 ttl;
    }

    event Claim(
        bytes32 indexed node,
        address indexed owner,
        bytes dnsname,
        uint32 inception
    );
    event NewPublicSuffixList(address suffixes);
    event InceptionUpdated(
        bytes32 indexed node,
        bytes dnsname,
        uint32 inception
    );

    constructor(
        address _previousRegistrar,
        address _resolver,
        DNSSEC _dnssec,
        PublicSuffixList _suffixes,
        ENS _ens,
        uint32 rootInception
    ) {
        previousRegistrar = _previousRegistrar;
        resolver = _resolver;
        oracle = _dnssec;
        suffixes = _suffixes;
        emit NewPublicSuffixList(address(suffixes));
        ens = _ens;
        inceptions[bytes32(0)] = rootInception;
    }

    /// @dev This contract's owner-only functions can be invoked by the owner of the ENS root.
    modifier onlyOwner() {
        Root root = Root(ens.owner(bytes32(0)));
        address owner = root.owner();
        require(msg.sender == owner);
        _;
    }

    function setPublicSuffixList(PublicSuffixList _suffixes) public onlyOwner {
        suffixes = _suffixes;
        emit NewPublicSuffixList(address(suffixes));
    }

    /// @dev Submits proofs to the DNSSEC oracle, then claims a name using those proofs.
    /// @param name The name to claim, in DNS wire format.
    /// @param input A chain of signed DNS RRSETs ending with a text record.
    function proveAndClaim(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input
    ) public override {
        (bytes32 rootNode, bytes32 labelHash, address addr) = _claim(
            name,
            input
        );
        ens.setSubnodeOwner(rootNode, labelHash, addr);
    }

    function proveAndClaimWithResolver(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input,
        address resolver,
        address addr
    ) public override {
        (bytes32 rootNode, bytes32 labelHash, address owner) = _claim(
            name,
            input
        );
        if (msg.sender != owner) {
            revert PermissionDenied(msg.sender, owner);
        }
        ens.setSubnodeRecord(rootNode, labelHash, owner, resolver, 0);
        if (addr != address(0)) {
            if (resolver == address(0)) {
                revert PreconditionNotMet();
            }
            bytes32 node = NameCoder.namehash(rootNode, labelHash);
            // Set the resolver record
            AddrResolver(resolver).setAddr(node, addr);
        }
    }

    function supportsInterface(
        bytes4 interfaceID
    ) external pure override returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IDNSRegistrar).interfaceId;
    }

    function _claim(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input
    ) internal returns (bytes32 parentNode, bytes32 labelHash, address addr) {
        RRUtils.SignedSet[] memory sss = oracle.verifyRRSet(input);

        // Get the first label
        uint256 offset;
        (labelHash, offset) = NameCoder.readLabel(name, 0);

        // Make sure the parent name is enabled
        parentNode = enableNode(name.substring(offset, name.length - offset));

        uint32 inception;
        bytes32 node;
        for (uint256 i; i < sss.length; ++i) {
            bytes memory ancestor = sss[i].name;
            if (i > 0) {
                (bytes32 label, ) = NameCoder.readLabel(ancestor, 0);
                node = NameCoder.namehash(node, label);
            }
            uint32 last = inceptions[node];
            inception = sss[i].inception;
            if (!RRUtils.serialNumberGte(inception, last)) {
                revert StaleProof(ancestor, last, inception);
            }
            inceptions[node] = inception;
            emit InceptionUpdated(node, ancestor, inception);
        }

        bool found;
        if (sss.length > 0) {
            (addr, found) = DNSClaimChecker.getOwnerAddress(
                name,
                sss[sss.length - 1].data
            );
        }
        if (!found) {
            revert NoOwnerRecordFound();
        }

        emit Claim(node, addr, name, inception);
    }

    function enableNode(bytes memory domain) public returns (bytes32 node) {
        // Name must be in the public suffix list.
        if (!suffixes.isPublicSuffix(domain)) {
            revert InvalidPublicSuffix(domain);
        }
        return _enableNode(domain, 0);
    }

    function _enableNode(
        bytes memory domain,
        uint256 offset
    ) internal returns (bytes32 node) {
        (bytes32 labelHash, uint256 next) = NameCoder.readLabel(domain, offset);
        if (labelHash == bytes32(0)) {
            return bytes32(0);
        }
        bytes32 parentNode = _enableNode(domain, next);
        node = NameCoder.namehash(parentNode, labelHash);
        address owner = ens.owner(node);
        if (owner == address(0) || owner == previousRegistrar) {
            if (parentNode == bytes32(0)) {
                Root root = Root(ens.owner(bytes32(0)));
                root.setSubnodeOwner(labelHash, address(this));
                ens.setResolver(node, resolver);
            } else {
                ens.setSubnodeRecord(
                    parentNode,
                    labelHash,
                    address(this),
                    resolver,
                    0
                );
            }
        } else if (owner != address(this)) {
            revert PreconditionNotMet();
        }
        return node;
    }
}
