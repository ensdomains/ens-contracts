// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/wrapper/NameWrapper.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "../../contracts/wrapper/INameWrapper.sol";
import "../../contracts/wrapper/IMetadataService.sol";
import {ReverseRegistrar} from "../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {StaticMetadataService} from "../../contracts/wrapper/StaticMetadataService.sol";

/**
 * @title BaseWrapperTest
 * @dev Base test contract providing common setup for NameWrapper functionality tests.
 *      Eliminates code duplication across wrapper test files while maintaining
 *      the exact setup patterns used throughout the test suite.
 */
abstract contract BaseWrapperTest is Test {
    // Core ENS contracts used by all wrapper tests
    NameWrapper public nameWrapper;
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    IMetadataService public metadataService;
    ReverseRegistrar public reverseRegistrar;

    // Standard test accounts used across wrapper tests
    address constant OWNER = address(0x1);
    address constant ACCOUNT = address(0x2);
    address constant ACCOUNT2 = address(0x3);
    address constant OTHER = address(0x4);
    address constant APPROVED = address(0x5);

    // ENS registry node constants
    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_LABEL = keccak256("eth");
    bytes32 constant ETH_NODE =
        keccak256(abi.encodePacked(ROOT_NODE, ETH_LABEL));
    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;

    // Default test domain setup - can be overridden by inheriting contracts
    string internal defaultLabel = "test";
    bytes32 internal defaultLabelHash;
    uint256 internal defaultLabelId;
    bytes32 internal defaultNode;
    uint256 internal defaultNodeId;

    // Time and expiry constants
    uint256 constant DAY = 86400;
    uint64 constant MAX_EXPIRY = type(uint64).max;

    // Standard events emitted by NameWrapper operations
    event NameWrapped(
        bytes32 indexed node,
        bytes name,
        address owner,
        uint32 fuses,
        uint64 expiry
    );
    event NameUnwrapped(bytes32 indexed node, address owner);
    event FusesSet(bytes32 indexed node, uint32 fuses);
    event ExpiryExtended(bytes32 indexed node, uint64 expiry);
    event ApprovalForAll(
        address indexed account,
        address indexed operator,
        bool approved
    );
    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );

    /**
     * @dev Sets up the complete ENS and NameWrapper environment.
     *      Virtual function allows inheriting contracts to extend setup.
     */
    function setUp() public virtual {
        _deployContracts();
        _configurePermissions();
        _setupDefaultDomain();
    }

    /**
     * @dev Deploys all core ENS contracts in the standard test configuration.
     *      This matches the exact deployment pattern used across all wrapper tests.
     */
    function _deployContracts() internal {
        vm.startPrank(OWNER);

        // Deploy core ENS registry and .eth registrar
        ens = new ENSRegistry();
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        metadataService = IMetadataService(
            address(new StaticMetadataService("https://ens.domains"))
        );

        // Deploy reverse registrar and set up reverse registry FIRST
        // This is required before deploying NameWrapper because ReverseClaimer
        // constructor needs the reverse registrar to be available
        reverseRegistrar = new ReverseRegistrar(ens);

        // Set up reverse registry structure (.reverse and .addr.reverse)
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), OWNER);
        ens.setSubnodeOwner(
            keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse"))),
            keccak256("addr"),
            address(reverseRegistrar)
        );

        // Now deploy the NameWrapper - ReverseClaimer can find the reverse registrar
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);

        vm.stopPrank();
    }

    /**
     * @dev Configures ENS registry structure and contract permissions.
     *      Sets up the .eth TLD and controller permissions.
     */
    function _configurePermissions() internal {
        vm.startPrank(OWNER);

        // Set up .eth top-level domain owned by BaseRegistrar
        ens.setSubnodeOwner(ROOT_NODE, ETH_LABEL, address(baseRegistrar));

        // Grant NameWrapper controller permissions on BaseRegistrar
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(OWNER);

        vm.stopPrank();
    }

    /**
     * @dev Sets up default domain constants based on the configured label.
     *      Inheriting contracts can override defaultLabel before calling setUp().
     */
    function _setupDefaultDomain() internal virtual {
        defaultLabelHash = keccak256(bytes(defaultLabel));
        defaultLabelId = uint256(defaultLabelHash);
        defaultNode = keccak256(abi.encodePacked(ETH_NODE, defaultLabelHash));
        defaultNodeId = uint256(defaultNode);
    }

    /**
     * @dev Registers and wraps a domain with specified parameters.
     * @param label The domain label to register (without .eth)
     * @param owner The address that will own the wrapped domain
     * @param fuses The fuse configuration for the wrapped domain
     * @return The expiry timestamp of the wrapped domain
     */
    function _wrapDomain(
        string memory label,
        address owner,
        uint32 fuses
    ) internal returns (uint64) {
        vm.startPrank(owner);

        // Move past grace period to allow registration
        vm.warp(block.timestamp + baseRegistrar.GRACE_PERIOD() + 1);

        uint256 labelId = uint256(keccak256(bytes(label)));

        // Register the domain in BaseRegistrar first
        baseRegistrar.register(labelId, owner, 365 days);

        // Approve NameWrapper to transfer the domain
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);

        // Wrap the domain with specified fuses
        uint64 expiry = nameWrapper.wrapETH2LD(
            label,
            owner,
            uint16(fuses),
            address(0)
        );

        vm.stopPrank();
        return expiry;
    }

    /**
     * @dev Convenience function to wrap the default test domain with no restrictions.
     * @return The expiry timestamp of the wrapped domain
     */
    function _wrapDefaultDomain() internal returns (uint64) {
        return _wrapDomain(defaultLabel, OWNER, CAN_DO_EVERYTHING);
    }

    /**
     * @dev Convenience function to wrap the default test domain with specific fuses.
     * @param fuses The fuse configuration to apply
     * @return The expiry timestamp of the wrapped domain
     */
    function _wrapDefaultDomainWithFuses(
        uint32 fuses
    ) internal returns (uint64) {
        return _wrapDomain(defaultLabel, OWNER, fuses);
    }

    /**
     * @dev Creates a subdomain under a wrapped parent domain.
     * @param parentNode The namehash of the parent domain
     * @param subLabel The label for the subdomain
     * @param owner The address that will own the subdomain
     * @param fuses The fuse configuration for the subdomain
     * @param expiry The expiry timestamp for the subdomain
     * @return The namehash of the created subdomain
     */
    function _createSubdomain(
        bytes32 parentNode,
        string memory subLabel,
        address owner,
        uint32 fuses,
        uint64 expiry
    ) internal returns (bytes32) {
        vm.startPrank(OWNER);
        bytes32 subNode = nameWrapper.setSubnodeOwner(
            parentNode,
            subLabel,
            owner,
            fuses,
            expiry
        );
        vm.stopPrank();
        return subNode;
    }

    /**
     * @dev Utility function to calculate a node hash from parent and label.
     * @param parent The parent node hash
     * @param label The label string
     * @return The calculated node hash
     */
    function _makeNode(
        bytes32 parent,
        string memory label
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }

    /**
     * @dev Utility function to convert a node hash to token ID.
     * @param node The node hash
     * @return The token ID for ERC1155 operations
     */
    function _nodeToId(bytes32 node) internal pure returns (uint256) {
        return uint256(node);
    }
}
