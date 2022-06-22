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
contract DNSRegistrar is IDNSRegistrar, IERC165 {
    using BytesUtils for bytes;
    using Buffer for Buffer.buffer;
    using RRUtils for *;

    DNSSEC public oracle;
    ENS public ens;
    PublicSuffixList public suffixes;

    error NoOwnerRecordFound();

    struct OwnerRecord {
        bytes name;
        address owner;
        address resolver;
        uint64 ttl;
    }

    event Claim(bytes32 indexed node, bytes dnsname, address owner, address resolver, uint64 ttl);
    event NewOracle(address oracle);
    event NewPublicSuffixList(address suffixes);

    constructor(DNSSEC _dnssec, PublicSuffixList _suffixes, ENS _ens) {
        oracle = _dnssec;
        emit NewOracle(address(oracle));
        suffixes = _suffixes;
        emit NewPublicSuffixList(address(suffixes));
        ens = _ens;
    }

    /**
     * @dev This contract's owner-only functions can be invoked by the owner of the ENS root.
     */
    modifier onlyOwner {
        Root root = Root(ens.owner(bytes32(0)));
        address owner = root.owner();
        require(msg.sender == owner);
        _;
    }

    function setOracle(DNSSEC _dnssec) public onlyOwner {
        oracle = _dnssec;
        emit NewOracle(address(oracle));
    }

    function setPublicSuffixList(PublicSuffixList _suffixes) public onlyOwner {
        suffixes = _suffixes;
        emit NewPublicSuffixList(address(suffixes));
    }

    /**
     * @dev Submits proofs to the DNSSEC oracle, then claims a name using those proofs.
     * @param input A chain of signed DNS RRSETs ending with a text record.
     */
    function proveAndClaim(DNSSEC.RRSetWithSignature[] memory input) public override {
        bytes memory record = oracle.verifyRRSet(input);
        _claim(record);
    }

    function supportsInterface(bytes4 interfaceID) external pure override returns (bool) {
        return interfaceID == type(IERC165).interfaceId ||
               interfaceID == type(IDNSRegistrar).interfaceId;
    }

    function _claim(bytes memory data) internal {
        OwnerRecord memory record = decodeOwnerRecord(data);

        // Get the first label
        uint labelLen = record.name.readUint8(0);
        bytes32 labelHash = record.name.keccak(1, labelLen);

        // Parent name must be in the public suffix list.
        bytes memory parentName = record.name.substring(labelLen + 1, record.name.length - labelLen - 1);
        require(suffixes.isPublicSuffix(parentName), "Parent name must be a public suffix");

        // Make sure the parent name is enabled
        bytes32 rootNode = enableNode(parentName, 0);

        ens.setSubnodeRecord(rootNode, labelHash, record.owner, record.resolver, record.ttl);

        emit Claim(
            keccak256(abi.encodePacked(rootNode, labelHash)),
            record.name,
            record.owner,
            record.resolver,
            record.ttl);
    }

    function enableNode(bytes memory domain, uint offset) internal returns(bytes32 node) {
        uint len = domain.readUint8(offset);
        if(len == 0) {
            return bytes32(0);
        }

        bytes32 parentNode = enableNode(domain, offset + len + 1);
        bytes32 label = domain.keccak(offset + 1, len);
        node = keccak256(abi.encodePacked(parentNode, label));
        address owner = ens.owner(node);
        require(owner == address(0) || owner == address(this), "Cannot enable a name owned by someone else");
        if(owner != address(this)) {
            if(parentNode == bytes32(0)) {
                Root root = Root(ens.owner(bytes32(0)));
                root.setSubnodeOwner(label, address(this));
            } else {
                ens.setSubnodeOwner(parentNode, label, address(this));
            }
        }
        return node;
    }

    function decodeOwnerRecord(bytes memory record) internal pure returns(OwnerRecord memory ret) {
        for (RRUtils.RRIterator memory iter = record.iterateRRs(0); !iter.done(); iter.next()) {
            if(tryParseOwnerRecord(ret, iter.data, iter.rdataOffset)) {
                return ret;
            }
        }
        revert NoOwnerRecordFound();
    }

    function tryParseOwnerRecord(OwnerRecord memory ret, bytes memory data, uint256 idx) internal pure returns(bool) {
        while(idx < data.length) {
            uint256 len = data.readUint8(idx); idx += 1;
            
            idx += len;
        }
    }
}
