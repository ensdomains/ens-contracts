// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/registry/ENSRegistry.sol";
import "../../contracts/reverseRegistrar/ReverseRegistrar.sol";
import "../../contracts/test/mocks/MockReverseClaimerImplementer.sol";

/**
 * @title TestReverseClaimer
 * @dev Complete tests for ReverseClaimer functionality
 */
contract TestReverseClaimer is Test {
    ENSRegistry public ens;
    ReverseRegistrar public reverseRegistrar;
    
    address constant USER1 = address(0x1);
    address constant USER2 = address(0x2);
    
    bytes32 constant ZERO_HASH = bytes32(0);
    bytes32 constant REVERSE_NODE = keccak256(abi.encodePacked(ZERO_HASH, keccak256("reverse")));
    bytes32 constant ADDR_NODE = keccak256(abi.encodePacked(REVERSE_NODE, keccak256("addr")));
    
    function setUp() public {
        ens = new ENSRegistry();
        reverseRegistrar = new ReverseRegistrar(ens);
        
        // Set up reverse registrar structure
        ens.setSubnodeOwner(ZERO_HASH, keccak256("reverse"), address(this));
        ens.setSubnodeOwner(REVERSE_NODE, keccak256("addr"), address(reverseRegistrar));
    }
    
    // Test 1: claims a reverse node to the msg.sender of the deployer
    function testClaimsReverseNodeToMsgSenderOfDeployer() public {
        // Test that a contract deployed with deployer as claimant works correctly
        MockReverseClaimerImplementer implementer = new MockReverseClaimerImplementer(
            ens,
            address(this) // Explicitly set deployer as claimant
        );
        
        bytes32 reverseNode = _getReverseNodeHash(address(implementer));
        address owner = ens.owner(reverseNode);
        
        // Should be owned by the deployer (this test contract)
        assertEq(owner, address(this), "Deployer should own the reverse name when specified as claimant");
    }
    
    // Test 2: claims a reverse node to an address specified by the deployer
    function testClaimsReverseNodeToAddressSpecifiedByDeployer() public {
        // Test that a contract can specify a different reverse claimer
        MockReverseClaimerImplementer implementer = new MockReverseClaimerImplementer(
            ens,
            USER1
        );
        
        bytes32 reverseNode = _getReverseNodeHash(address(implementer));
        address owner = ens.owner(reverseNode);
        
        assertEq(owner, USER1, "Specified owner should own the reverse name");
    }
    
    // Additional test: verifies multiple contracts can claim independently
    function testMultipleReverseClaimersCanClaimIndependently() public {
        // Test multiple contracts with different reverse claimers
        MockReverseClaimerImplementer implementer1 = new MockReverseClaimerImplementer(
            ens,
            USER1
        );
        
        MockReverseClaimerImplementer implementer2 = new MockReverseClaimerImplementer(
            ens,
            USER2
        );
        
        bytes32 reverseNode1 = _getReverseNodeHash(address(implementer1));
        bytes32 reverseNode2 = _getReverseNodeHash(address(implementer2));
        
        assertEq(ens.owner(reverseNode1), USER1, "First implementer should have USER1 as reverse owner");
        assertEq(ens.owner(reverseNode2), USER2, "Second implementer should have USER2 as reverse owner");
    }
    
    // Helper function to get reverse node hash for an address
    function _getReverseNodeHash(address addr) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                ADDR_NODE,
                keccak256(abi.encodePacked(_addressToHex(addr)))
            )
        );
    }
    
    // Helper function to convert address to hex string (lowercase)
    function _addressToHex(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(40);
        bytes memory alphabet = "0123456789abcdef";
        
        uint256 value = uint256(uint160(addr));
        for (uint256 i = 39; i >= 0; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
            if (i == 0) break;
        }
        
        return string(buffer);
    }
}