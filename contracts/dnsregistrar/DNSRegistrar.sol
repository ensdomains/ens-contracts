//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@ensdomains/buffer/contracts/Buffer.sol";
import "../dnssec-oracle/BytesUtils.sol";
import "../dnssec-oracle/DNSSEC.sol";
import "../dnssec-oracle/RRUtils.sol";
import "../registry/ENSRegistry.sol";
import "../root/Root.sol";
import "../resolvers/profiles/AddrResolver.sol";
import "./DNSClaimChecker.sol";
import "./PublicSuffixList.sol";
import "./IDNSRegistrar.sol";

/**
 * @dev An ENS registrar that allows the owner of a DNS name to claim the
 *      corresponding name in ENS.
 */
// TODO: Record inception time of any claimed name, so old proofs can't be used to revert changes to a name.
contract DNSRegistrar is IDNSRegistrar, IERC165 {
    using BytesUtils for bytes;
    using Buffer for Buffer.buffer;
    using RRUtils for *;

    ENS public immutable ens;
    DNSSEC public immutable oracle;
    PublicSuffixList public suffixes;
    // A mapping of the most recent signatures seen for each claimed domain.
    mapping(bytes32 => uint32) public inceptions;

    error NoOwnerRecordFound();
    error StaleProof();

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
    event NewOracle(address oracle);
    event NewPublicSuffixList(address suffixes);

    constructor(
        DNSSEC _dnssec,
        PublicSuffixList _suffixes,
        ENS _ens
    ) {
        oracle = _dnssec;
        emit NewOracle(address(oracle));
        suffixes = _suffixes;
        emit NewPublicSuffixList(address(suffixes));
        ens = _ens;
    }

    /**
     * @dev This contract's owner-only functions can be invoked by the owner of the ENS root.
     */
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

    /**
     * @dev Submits proofs to the DNSSEC oracle, then claims a name using those proofs.
     * @param name The name to claim, in DNS wire format.
     * @param input A chain of signed DNS RRSETs ending with a text record.
     */
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
        require(
            msg.sender == owner,
            "Only owner can call proveAndClaimWithResolver"
        );
        if (addr != address(0)) {
            require(
                resolver != address(0),
                "Cannot set addr if resolver is not set"
            );
            // Set ourselves as the owner so we can set a record on the resolver
            ens.setSubnodeRecord(
                rootNode,
                labelHash,
                address(this),
                resolver,
                0
            );
            bytes32 node = keccak256(abi.encodePacked(rootNode, labelHash));
            // Set the resolver record
            AddrResolver(resolver).setAddr(node, addr);
            // Transfer the record to the owner
            ens.setOwner(node, owner);
        } else {
            ens.setSubnodeRecord(rootNode, labelHash, owner, resolver, 0);
        }
    }

    function supportsInterface(bytes4 interfaceID)
        external
        pure
        override
        returns (bool)
    {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IDNSRegistrar).interfaceId;
    }

    function _claim(bytes memory name, DNSSEC.RRSetWithSignature[] memory input)
        internal
        returns (
            bytes32 parentNode,
            bytes32 labelHash,
            address addr
        )
    {
        (bytes memory data, uint32 inception) = oracle.verifyRRSet(input);

        // Get the first label
        uint256 labelLen = name.readUint8(0);
        labelHash = name.keccak(1, labelLen);

        // Parent name must be in the public suffix list.
        bytes memory parentName = name.substring(
            labelLen + 1,
            name.length - labelLen - 1
        );
        require(
            suffixes.isPublicSuffix(parentName),
            "Parent name must be a public suffix"
        );

        // Make sure the parent name is enabled
        parentNode = enableNode(parentName, 0);

        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        if (!RRUtils.serialNumberGte(inception, inceptions[node])) {
            revert StaleProof();
        }
        inceptions[node] = inception;

        (addr, ) = DNSClaimChecker.getOwnerAddress(name, data);

        emit Claim(node, addr, name, inception);
    }

    function enableNode(bytes memory domain, uint256 offset)
        internal
        returns (bytes32 node)
    {
        uint256 len = domain.readUint8(offset);
        if (len == 0) {
            return bytes32(0);
        }

        bytes32 parentNode = enableNode(domain, offset + len + 1);
        bytes32 label = domain.keccak(offset + 1, len);
        node = keccak256(abi.encodePacked(parentNode, label));
        address owner = ens.owner(node);
        require(
            owner == address(0) || owner == address(this),
            "Cannot enable a name owned by someone else"
        );
        if (owner != address(this)) {
            if (parentNode == bytes32(0)) {
                Root root = Root(ens.owner(bytes32(0)));
                root.setSubnodeOwner(label, address(this));
            } else {
                ens.setSubnodeOwner(parentNode, label, address(this));
            }
        }
        return node;
    }
}
