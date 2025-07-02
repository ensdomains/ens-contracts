// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "contracts/registry/ENSRegistry.sol";
import "contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "contracts/ethregistrar/StaticBulkRenewal.sol";
import "contracts/ethregistrar/IPriceOracle.sol";
import {ETHRegistrarController} from "contracts/ethregistrar/ETHRegistrarController.sol";

// Mock ReverseRegistrar to avoid import conflicts
contract MockReverseRegistrar {
    function claim(address) external pure returns (bytes32) {
        return keccak256("mock.reverse");
    }
    
    function claimForAddr(address, address, address) external pure returns (bytes32) {
        return keccak256("mock.reverse");
    }
    
    function setName(string memory) external pure returns (bytes32) {
        return keccak256("mock.reverse");
    }
}

// Mock ETHRegistrarController that provides the minimal interface needed by StaticBulkRenewal
contract MockETHRegistrarController {
    mapping(string => bool) public registeredNames;
    
    function setNameRegistered(string memory name, bool registered) external {
        registeredNames[name] = registered;
    }
    
    function rentPrice(string memory name, uint256 duration) external view returns (IPriceOracle.Price memory price) {
        // Simple pricing: duration per name
        price.base = duration;
        price.premium = 0;
        return price;
    }
    
    function renew(string memory name, uint256 duration) external payable returns (uint256) {
        // Check if name is registered
        require(registeredNames[name], "Name not registered");
        
        // Return future timestamp
        return block.timestamp + duration;
    }
}

/**
 * @title TestStaticBulkRenewal
 * @dev Tests bulk renewal functionality for ENS domains including cost calculation and batch renewal operations
 */
contract TestStaticBulkRenewal is Test {
    
    StaticBulkRenewal public bulkRenewal;
    MockETHRegistrarController public mockController;
    
    // Function to receive ETH (for excess payment returns)
    receive() external payable {}
    
    // Test accounts
    address public owner;
    address public account1;
    address public account2;
    
    function setUp() public {
        // Set up test accounts using simple addresses
        owner = address(0x1);
        account1 = address(0x2);
        account2 = address(0x3);
        
        // Fund test accounts
        vm.deal(owner, 100 ether);
        vm.deal(account1, 100 ether);
        vm.deal(account2, 100 ether);
        
        // Create mock controller
        mockController = new MockETHRegistrarController();
        
        // Create the bulk renewal contract
        bulkRenewal = new StaticBulkRenewal(ETHRegistrarController(address(mockController)));
        
        // Set up test names as registered in mock controller
        string[3] memory testNames = ["test1", "test2", "test3"];
        for (uint i = 0; i < testNames.length; i++) {
            mockController.setNameRegistered(testNames[i], true);
        }
    }
    
    // Simple test to verify basic setup
    function testSetupWorks() public view {
        assertTrue(address(bulkRenewal) != address(0), "Bulk renewal should be deployed");
        assertTrue(address(mockController) != address(0), "Mock controller should be deployed");
    }
    
    // Test 1: "should return the cost of a bulk renewal"
    function testShouldReturnCostOfBulkRenewal() public view {
        string[] memory names = new string[](2);
        names[0] = "test1";
        names[1] = "test2";
        
        uint256 duration = 86400; // 1 day
        uint256 cost = bulkRenewal.rentPrice(names, duration);
        
        // Expected: 86400 * 2 = 172800 (duration * number of names)
        assertEq(cost, duration * 2, "Bulk renewal cost should be duration * number of names");
    }
    
    // Test 2: "should raise an error trying to renew a nonexistent name"
    function testShouldRaiseErrorRenewingNonexistentName() public {
        string[] memory names = new string[](1);
        names[0] = "foobar"; // nonexistent name
        
        uint256 duration = 86400; // 1 day
        
        vm.expectRevert();
        bulkRenewal.renewAll(names, duration);
    }
    
    // Test 3: "should permit bulk renewal of names"
    function testShouldPermitBulkRenewalOfNames() public {
        string[] memory names = new string[](2);
        names[0] = "test1";
        names[1] = "test2";
        
        uint256 duration = 86400; // 1 day
        uint256 cost = bulkRenewal.rentPrice(names, duration);
        
        // This should not revert
        bulkRenewal.renewAll{value: cost}(names, duration);
        
        // Check any excess funds are returned (contract balance should be 0)
        assertEq(address(bulkRenewal).balance, 0, "Contract should not retain any funds");
    }
}
