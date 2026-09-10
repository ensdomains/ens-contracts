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

    bytes32 constant LABELHASH_PREFIX = keccak256("_ens");

    ENS public immutable ens;
    DNSSEC public immutable oracle;
    PublicSuffixList public suffixes;
    address public immutable previousRegistrar;
    address public immutable resolver;
    // A mapping of the most recent signatures seen for each type of each claimed domain.
    mapping(bytes32 node => mapping(uint16 typeCovered => uint32 time))
        internal _inceptions;
    mapping(address registrar => bool was) public wasRegistrar;

    error NoOwnerRecordFound();
    error PermissionDenied(address caller, address owner);
    error PreconditionNotMet();
    error StaleProof(
        bytes name,
        uint16 typeCovered,
        uint32 lastTime,
        uint32 time
    );
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
        uint16 indexed dnstype,
        uint32 inception
    );

    constructor(
        address[] memory previousRegistrars,
        address _resolver,
        DNSSEC _dnssec,
        PublicSuffixList _suffixes,
        ENS _ens
    ) {
        address last;
        for (uint256 i; i < previousRegistrars.length; ++i) {
            last = previousRegistrars[i];
            wasRegistrar[last] = true;
        }
        previousRegistrar = last;
        resolver = _resolver;
        oracle = _dnssec;
        suffixes = _suffixes;
        emit NewPublicSuffixList(address(suffixes));
        ens = _ens;
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

    /// @notice Verify proofs with DNSSEC oracle, claim the name, but registry not updated.
    /// @param name DNS-encoded name to claim.
    /// @param input A chain of signed DNS RRSETs ending with a text record.
    function proveAndClaimWithoutRegistration(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input
    ) external {
        _claim(name, input);
    }

    /// @inheritdoc IDNSRegistrar
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

    /// @inheritdoc IDNSRegistrar
    function proveAndClaimWithResolver(
        bytes memory name,
        DNSSEC.RRSetWithSignature[] memory input,
        address _resolver,
        address addr
    ) public override {
        (bytes32 rootNode, bytes32 labelHash, address owner) = _claim(
            name,
            input
        );
        if (msg.sender != owner) {
            revert PermissionDenied(msg.sender, owner);
        }
        ens.setSubnodeRecord(rootNode, labelHash, owner, _resolver, 0);
        if (addr != address(0)) {
            if (_resolver == address(0)) {
                revert PreconditionNotMet();
            }
            bytes32 node = NameCoder.namehash(rootNode, labelHash);
            // Set the resolver record
            AddrResolver(_resolver).setAddr(node, addr);
        }
    }

    function supportsInterface(
        bytes4 interfaceID
    ) external pure override returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IDNSRegistrar).interfaceId;
    }

    /// @inheritdoc IDNSRegistrar
    function getInception(
        bytes calldata name,
        uint16 typeCovered
    ) public view returns (uint32 inception) {
        (, inception) = _inceptionForType(name, typeCovered);
    }

    /// @inheritdoc IDNSRegistrar
    function inceptions(bytes32 node) external view returns (uint32 inception) {
        return
            _inceptionWithFallback(
                node,
                NameCoder.namehash(node, LABELHASH_PREFIX)
            );
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

        for (uint256 i; i < sss.length; ++i) {
            RRUtils.SignedSet memory ss = sss[i];
            (bytes32 node, uint32 last) = _inceptionForType(
                ss.name,
                ss.typeCovered
            );
            if (ss.inception != last) {
                if (!RRUtils.serialNumberGte(ss.inception, last)) {
                    revert StaleProof(
                        ss.name,
                        ss.typeCovered,
                        last,
                        ss.inception
                    );
                }
                _inceptions[node][ss.typeCovered] = ss.inception;
                emit InceptionUpdated(
                    node,
                    ss.name,
                    ss.typeCovered,
                    ss.inception
                );
            }
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

        emit Claim(
            NameCoder.namehash(parentNode, labelHash),
            addr,
            name,
            sss[sss.length - 1].inception
        );
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
        if (owner == address(0) || wasRegistrar[owner]) {
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

    /// @dev Determine the last inception time for record type.
    function _inceptionForType(
        bytes memory name,
        uint16 typeCovered
    ) internal view returns (bytes32 node, uint32 inception) {
        (bytes32 labelHash, uint256 offset) = NameCoder.readLabel(name, 0);
        bytes32 parentNode;
        if (labelHash != bytes32(0)) {
            parentNode = NameCoder.namehash(name, offset);
            node = NameCoder.namehash(parentNode, labelHash);
        }
        inception = typeCovered == RRUtils.DNSTYPE_TXT &&
            labelHash == LABELHASH_PREFIX
            ? _inceptionWithFallback(parentNode, node)
            : _inceptions[node][typeCovered];
    }

    /// @dev Determine the last inception time of a TXT record.
    function _inceptionWithFallback(
        bytes32 parentNode,
        bytes32 node
    ) internal view returns (uint32 inception) {
        inception = _inceptions[node][RRUtils.DNSTYPE_TXT];
        if (inception == 0 && previousRegistrar != address(0)) {
            inception = DNSRegistrar(previousRegistrar).inceptions(parentNode);
        }
    }
}
