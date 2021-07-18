pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "../dnssec-oracle/BytesUtils.sol";
import "../dnssec-oracle/DNSSEC.sol";
import "../registry/ENSRegistry.sol";
import "../root/Root.sol";
import "./DNSClaimChecker.sol";
import "./PublicSuffixList.sol";
import "../resolvers/profiles/AddrResolver.sol";

interface IDNSRegistrar {
    function claim(bytes memory name, bytes memory proof) external;
    function proveAndClaim(bytes memory name, DNSSEC.RRSetWithSignature[] memory input, bytes memory proof) external;
    function proveAndClaimWithResolver(bytes memory name, DNSSEC.RRSetWithSignature[] memory input, bytes memory proof, address resolver, address addr) external;
}

/**
 * @dev An ENS registrar that allows the owner of a DNS name to claim the
 *      corresponding name in ENS.
 */
contract DNSRegistrar is IDNSRegistrar {
    using BytesUtils for bytes;

    DNSSEC public oracle;
    ENS public ens;
    PublicSuffixList public suffixes;

    bytes4 constant private INTERFACE_META_ID = bytes4(keccak256("supportsInterface(bytes4)"));

    event Claim(bytes32 indexed node, address indexed owner, bytes dnsname);
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
     * @dev Claims a name by proving ownership of its DNS equivalent.
     * @param name The name to claim, in DNS wire format.
     * @param proof A DNS RRSet proving ownership of the name. Must be verified
     *        in the DNSSEC oracle before calling. This RRSET must contain a TXT
     *        record for '_ens.' + name, with the value 'a=0x...'. Ownership of
     *        the name will be transferred to the address specified in the TXT
     *        record.
     */
    function claim(bytes memory name, bytes memory proof) public override {
        (bytes32 rootNode, bytes32 labelHash, address addr) = _claim(name, proof);
        ens.setSubnodeOwner(rootNode, labelHash, addr);
    }

    /**
     * @dev Submits proofs to the DNSSEC oracle, then claims a name using those proofs.
     * @param name The name to claim, in DNS wire format.
     * @param input The data to be passed to the Oracle's `submitProofs` function. The last
     *        proof must be the TXT record required by the registrar.
     * @param proof The proof record for the first element in input.
     */
    function proveAndClaim(bytes memory name, DNSSEC.RRSetWithSignature[] memory input, bytes memory proof) public override {
        proof = oracle.submitRRSets(input, proof);
        claim(name, proof);
    }

    function proveAndClaimWithResolver(bytes memory name, DNSSEC.RRSetWithSignature[] memory input, bytes memory proof, address resolver, address addr) public override {
        proof = oracle.submitRRSets(input, proof);
        (bytes32 rootNode, bytes32 labelHash, address owner) = _claim(name, proof);
        require(msg.sender == owner, "Only owner can call proveAndClaimWithResolver");
        if(addr != address(0)) {
            require(resolver != address(0), "Cannot set addr if resolver is not set");
            // Set ourselves as the owner so we can set a record on the resolver
            ens.setSubnodeRecord(rootNode, labelHash, address(this), resolver, 0);
            bytes32 node = keccak256(abi.encodePacked(rootNode, labelHash));
            // Set the resolver record
            AddrResolver(resolver).setAddr(node, addr);
            // Transfer the record to the owner
            ens.setOwner(node, owner);
        } else {
            ens.setSubnodeRecord(rootNode, labelHash, owner, resolver, 0);
        }
    }

    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return interfaceID == INTERFACE_META_ID ||
               interfaceID == type(IDNSRegistrar).interfaceId;
    }

    function _claim(bytes memory name, bytes memory proof) internal returns(bytes32 rootNode, bytes32 labelHash, address addr) {
        // Get the first label
        uint labelLen = name.readUint8(0);
        labelHash = name.keccak(1, labelLen);

        // Parent name must be in the public suffix list.
        bytes memory parentName = name.substring(labelLen + 1, name.length - labelLen - 1);
        require(suffixes.isPublicSuffix(parentName), "Parent name must be a public suffix");

        // Make sure the parent name is enabled
        rootNode = enableNode(parentName, 0);

        (addr,) = DNSClaimChecker.getOwnerAddress(oracle, name, proof);

        emit Claim(keccak256(abi.encodePacked(rootNode, labelHash)), addr, name);
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
}
