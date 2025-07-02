// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import {ENSRegistry} from "../contracts/registry/ENSRegistry.sol";
import {BaseRegistrarImplementation} from "../contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {ReverseRegistrar} from "../contracts/reverseRegistrar/ReverseRegistrar.sol";
import {NameWrapper} from "../contracts/wrapper/NameWrapper.sol";
import {PublicResolver} from "../contracts/resolvers/PublicResolver.sol";
import {Root} from "../contracts/root/Root.sol";
import {ETHRegistrarController} from "../contracts/ethregistrar/ETHRegistrarController.sol";
import {StablePriceOracle} from "../contracts/ethregistrar/StablePriceOracle.sol";
import {DummyOracle} from "../contracts/ethregistrar/DummyOracle.sol";
import {IPriceOracle} from "../contracts/ethregistrar/IPriceOracle.sol";
import {AggregatorInterface} from "../contracts/ethregistrar/StablePriceOracle.sol";
import {IMetadataService} from "../contracts/wrapper/IMetadataService.sol";
import {MockMetadataService} from "./utils/MockMetadataService.sol";

// Import utility libraries
import {ENSTestConstants} from "./utils/ENSTestConstants.sol";
import {ENSTestUtils} from "./utils/ENSTestUtils.sol";
import {TestAccounts} from "./utils/TestAccounts.sol";

/**
 * @title BaseTest
 * @dev Base test contract that connects to deployed ENS infrastructure
 * Assumes contracts are already deployed via deploy scripts to the devnet
 */
abstract contract BaseTest is Test {
    // Make libraries available
    using ENSTestUtils for string;
    using ENSTestUtils for bytes32;
    
    // Re-export commonly used constants for convenience
    bytes32 public constant ZERO_HASH = ENSTestConstants.ZERO_HASH;
    bytes32 public constant ETH_NODE = ENSTestConstants.ETH_NODE;
    bytes32 public constant REVERSE_NODE = ENSTestConstants.REVERSE_NODE;
    bytes32 public constant ADDR_REVERSE_NODE = ENSTestConstants.ADDR_REVERSE_NODE;
    
    uint256 public constant DAY = ENSTestConstants.DAY;
    uint256 public constant REGISTRATION_TIME = ENSTestConstants.REGISTRATION_TIME;
    uint256 public constant BUFFERED_REGISTRATION_COST = ENSTestConstants.BUFFERED_REGISTRATION_COST;
    
    // Re-export commonly used accounts for convenience
    address public USER1 = TestAccounts.account();
    address public USER2 = TestAccounts.account2();
    address public USER3 = TestAccounts.account3();
    
    // Core ENS contracts - to be populated from deployed addresses
    ENSRegistry public ens;
    BaseRegistrarImplementation public baseRegistrar;
    ReverseRegistrar public reverseRegistrar;
    NameWrapper public nameWrapper;
    ETHRegistrarController public controller;
    PublicResolver public publicResolver;
    Root public root;
    
    // Price oracle contracts
    StablePriceOracle public priceOracle;
    DummyOracle public dummyOracle;
    IMetadataService public metadataService;
    
    // Events for testing
    event NameRegistered(
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 duration,
        uint256 premium,
        uint256 expires
    );
    
    event NameRenewed(string name, bytes32 indexed label, uint256 duration, uint256 expires);
    
    function setUp() public virtual {
        // Set timestamp to a reasonable value for testing
        vm.warp(1640995200); // Jan 1, 2022
        
        // Fund test accounts
        vm.deal(TestAccounts.account(), 100 ether);
        vm.deal(TestAccounts.account2(), 100 ether);
        vm.deal(TestAccounts.account3(), 100 ether);
        
        // Connect to deployed contracts
        // These addresses would be read from deployment artifacts or environment variables
        _connectToDeployedContracts();
    }
    
    /**
     * @dev Connect to already deployed contracts
     * In a real scenario, these addresses would come from deployment artifacts
     * For now, we'll deploy them locally for testing purposes
     */
    function _connectToDeployedContracts() internal virtual {
        // TODO: Read addresses from deployment artifacts when using actual devnet
        // For now, deploy locally for testing
        _deployContractsLocally();
    }
    
    /**
     * @dev Temporary function to deploy contracts locally
     * This would be replaced with reading deployed addresses in production
     */
    function _deployContractsLocally() internal {
        vm.startPrank(TestAccounts.deployer());
        
        // Deploy core contracts
        ens = new ENSRegistry();
        root = new Root(ens);
        
        // Set up root ownership
        ens.setOwner(ZERO_HASH, address(root));
        root.setController(TestAccounts.owner(), true);
        root.transferOwnership(TestAccounts.owner());
        
        vm.stopPrank();
        vm.startPrank(TestAccounts.owner());
        
        // Deploy reverse registrar
        reverseRegistrar = new ReverseRegistrar(ens);
        reverseRegistrar.transferOwnership(TestAccounts.owner());
        
        // Set up reverse subdomain
        root.setSubnodeOwner(ENSTestUtils.labelhash("reverse"), TestAccounts.owner());
        ens.setSubnodeOwner(REVERSE_NODE, ENSTestUtils.labelhash("addr"), address(reverseRegistrar));
        
        // Deploy base registrar
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        baseRegistrar.transferOwnership(TestAccounts.owner());
        root.setSubnodeOwner(ENSTestUtils.labelhash("eth"), address(baseRegistrar));
        
        // Deploy metadata service for NameWrapper
        metadataService = IMetadataService(address(new MockMetadataService()));
        
        // Deploy NameWrapper
        nameWrapper = new NameWrapper(ens, baseRegistrar, metadataService);
        
        // Deploy price oracle
        dummyOracle = new DummyOracle(int256(100000000));
        uint256[] memory rentPrices = new uint256[](5);
        rentPrices[0] = 0;
        rentPrices[1] = 0;
        rentPrices[2] = 4;
        rentPrices[3] = 2;
        rentPrices[4] = 1;
        priceOracle = new StablePriceOracle(AggregatorInterface(address(dummyOracle)), rentPrices);
        
        // Deploy ETHRegistrarController
        controller = new ETHRegistrarController(
            baseRegistrar,
            priceOracle,
            60,      // MIN_COMMITMENT_AGE: 60 seconds
            86400,   // MAX_COMMITMENT_AGE: 86400 seconds (24 hours)
            reverseRegistrar,
            nameWrapper,
            ens
        );
        
        // Deploy PublicResolver
        publicResolver = new PublicResolver(
            ens,
            nameWrapper,
            address(controller),
            address(reverseRegistrar)
        );
        
        // Set up controller permissions
        nameWrapper.setController(address(controller), true);
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(address(controller));
        reverseRegistrar.setController(address(controller), true);
        
        vm.stopPrank();
    }
    
    // Utility functions - delegate to libraries
    function labelhash(string memory label) public pure returns (bytes32) {
        return ENSTestUtils.labelhash(label);
    }
    
    function namehash(string memory name) public pure virtual returns (bytes32) {
        return ENSTestUtils.namehash(name);
    }
    
    function namehash(bytes32 parentNode, string memory label) public pure returns (bytes32) {
        return ENSTestUtils.namehash(parentNode, label);
    }
    
    // Additional test helper functions
    function fundAccount(address account, uint256 amount) internal {
        vm.deal(account, amount);
    }
    
    function fundAccounts(address[] memory accounts, uint256 amount) internal {
        for (uint i = 0; i < accounts.length; i++) {
            fundAccount(accounts[i], amount);
        }
    }
    
    // Time manipulation helpers
    function skipTime(uint256 duration) internal {
        vm.warp(block.timestamp + duration);
    }
    
    function skipDays(uint256 numDays) internal {
        skipTime(numDays * ENSTestConstants.DAY);
    }
    
    // Helper function for converting label to ID
    function toLabelId(string memory label) public pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
    
    // Common assertions
    function assertOwner(bytes32 node, address expectedOwner) internal view {
        assertEq(ens.owner(node), expectedOwner, "Unexpected owner");
    }
    
    function assertResolver(bytes32 node, address expectedResolver) internal view {
        assertEq(ens.resolver(node), expectedResolver, "Unexpected resolver");
    }
}