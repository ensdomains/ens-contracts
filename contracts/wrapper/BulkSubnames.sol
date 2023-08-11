//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "../registry/ENS.sol";
import "../reverseRegistrar/ReverseClaimer.sol";
import "./IBulkSubnames.sol";
import {INameWrapper, IS_DOT_ETH} from "./INameWrapper.sol";

error Unauthorised(bytes32 node, address addr);

contract BulkSubnames is IBulkSubnames, ReverseClaimer {

    ENS public immutable ens;
    INameWrapper public immutable nameWrapper;

    uint64 private constant GRACE_PERIOD = 90 days;

    constructor(
        ENS _ens,
        INameWrapper _nameWrapper
    ) ReverseClaimer(_ens, msg.sender) {
        ens = _ens;
        nameWrapper = _nameWrapper;
    }

    // Permits modifications only by the owner of the specified registry node.
    modifier authorised(bytes32 node) {
        address owner = ens.owner(node);
        if (owner != msg.sender && !ens.isApprovedForAll(owner, msg.sender)) {
            revert Unauthorised(node, msg.sender);
        }

        _;
    }

    /**
     * @notice Checks if msg.sender is the owner or operator of the owner of a wrapped name
     * @param node namehash of the name to check
     */
    modifier onlyTokenOwner(bytes32 node) {
        if (!nameWrapper.canModifyName(node, msg.sender)) {
            revert Unauthorised(node, msg.sender);
        }

        _;
    }

    /**
     * @notice Checks if msg.sender is the owner/operator or approved subname renewal manager
     * @param node namehash of the name to check
     */
    modifier onlySubnameExtender(bytes32 node) {
        (address owner, uint32 fuses, uint64 expiry) = nameWrapper.getData(uint256(node));
        if ((owner != msg.sender && !nameWrapper.isApprovedForAll(owner, msg.sender) && nameWrapper.getApproved(uint256(node)) != msg.sender) || _isETH2LDInGracePeriod(fuses, expiry)) {
            revert Unauthorised(node, msg.sender);
        }

        _;
    }

    /**
     * @notice Bulk transfers ownership of subnodes keccak256(node, label) to a new address. May only be called by the owner of the parent node.
     * @param parentNode The parent node.
     * @param labelhashes The hashes of the labels specifying the subnodes.
     * @param owner The address of the new owner.
     */
    function bulkSetSubnodeOwner (
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        address owner
    ) public authorised(parentNode) {
        uint256 length = labelhashes.length;
        for (uint256 i = 0; i < length; ) {
            ens.setSubnodeOwner(
                parentNode,
                labelhashes[i],
                owner
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Bulk sets the records for subnodes. May only be called by the owner of the parent node.
     * @param parentNode The parent node.
     * @param labelhashes The hashes of the labels specifying the subnodes.
     * @param owner The address of the new owner.
     * @param resolver The address of the resolver.
     * @param ttl The TTL in seconds.
     */
    function bulkSetSubnodeRecord (
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        address owner,
        address resolver,
        uint64 ttl
    ) public authorised(parentNode) {
        uint256 length = labelhashes.length;
        for (uint256 i = 0; i < length; ) {
            ens.setSubnodeRecord(
                parentNode,
                labelhashes[i],
                owner,
                resolver,
                ttl
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Bulk sets the subdomain owners in the registry and then wraps the subdomains. May only be called by the owner of the parent node.
     * @param parentNode Parent namehash of the subdomain
     * @param labels Labels of the subdomains as strings
     * @param wrappedOwner New owner in the wrapper
     * @param fuses Initial fuses for the wrapped subdomain
     * @param expiry When the name will expire in seconds since the Unix epoch
     */
    function bulkSetWrappedSubnodeOwner (
        bytes32 parentNode,
        string[] calldata labels,
        address wrappedOwner,
        uint32 fuses,
        uint64 expiry
    ) public onlyTokenOwner(parentNode) {
        uint256 length = labels.length;
        for (uint256 i = 0; i < length; ) {
            nameWrapper.setSubnodeOwner(
                parentNode,
                labels[i],
                wrappedOwner,
                fuses,
                expiry
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Bulk sets the subdomain owner in the registry with records and then wraps the subdomains. May only be called by the owner of the parent node.
     * @param parentNode parent namehash of the subdomain
     * @param labels labels of the subdomains as strings
     * @param wrappedOwner new owner in the wrapper
     * @param resolver resolver contract in the registry
     * @param ttl ttl in the registry
     * @param fuses initial fuses for the wrapped subdomain
     * @param expiry When the name will expire in seconds since the Unix epoch
     */
    function bulkSetWrappedSubnodeRecord (
        bytes32 parentNode,
        string[] calldata labels,
        address wrappedOwner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) public onlyTokenOwner(parentNode) {
        uint256 length = labels.length;
        for (uint256 i = 0; i < length; ) {
            nameWrapper.setSubnodeRecord(
                parentNode,
                labels[i],
                wrappedOwner,
                resolver,
                ttl,
                fuses,
                expiry
            );
            unchecked {
                ++i;
            }
        }
    }

    /** 
     * @notice Bulk sets fuses of names that you own the parent of
     * @param parentNode Parent namehash of the name e.g. vitalik.xyz would be namehash('xyz')
     * @param labelhashes Labelhashes of the names, e.g. vitalik.xyz would be keccak256('vitalik')
     * @param fuses Fuses to burn
     * @param expiry When the name will expire in seconds since the Unix epoch
     */
    function bulkSetChildFuses(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        uint32 fuses,
        uint64 expiry
    ) public onlyTokenOwner(parentNode) {
        uint256 length = labelhashes.length;
        for (uint256 i = 0; i < length; ) {
            nameWrapper.setChildFuses(
                parentNode,
                labelhashes[i],
                fuses,
                expiry
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Bulk extends expiry for subnames. May only be called by the owner or approved subname renewal manager of the parent node.
     * @param parentNode Parent namehash of the name e.g. vitalik.xyz would be namehash('xyz')
     * @param labelhashes Labelhashes of the names, e.g. vitalik.xyz would be keccak256('vitalik')
     * @param expiry When the name will expire in seconds since the Unix epoch
     */
    function bulkExtendExpiry(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        uint64 expiry
    ) public onlySubnameExtender(parentNode) {
        uint256 length = labelhashes.length;
        for (uint256 i = 0; i < length; ) {
            nameWrapper.extendExpiry(
                parentNode,
                labelhashes[i],
                expiry
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Unwraps subnames of any kind. May only be called by the owner of the parent node.
     * @param parentNode Parent namehash of the name e.g. vitalik.xyz would be namehash('xyz')
     * @param labelhashes Labelhashes of the subnames, e.g. vitalik.xyz would be keccak256('vitalik')
     * @param controller Sets the owner in the registry to this address
     */
    function bulkUnwrap(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        address controller
    ) public onlyTokenOwner(parentNode) {
        uint256 length = labelhashes.length;
        for (uint256 i = 0; i < length; ) {
            nameWrapper.unwrap(
                parentNode,
                labelhashes[i],
                controller
            );
            unchecked {
                ++i;
            }
        }
    }

    function _isETH2LDInGracePeriod(
        uint32 fuses,
        uint64 expiry
    ) internal view returns (bool) {
        return
            fuses & IS_DOT_ETH == IS_DOT_ETH &&
            expiry - GRACE_PERIOD < block.timestamp;
    }
}