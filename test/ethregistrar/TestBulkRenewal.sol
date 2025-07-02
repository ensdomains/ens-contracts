// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../BaseTest.sol";
import "contracts/ethregistrar/BulkRenewal.sol";
import "contracts/ethregistrar/IETHRegistrarController.sol";

// Mock resolver that can return the controller address for BulkRenewal
contract MockETHResolver {
    address public controller;
    
    function setController(address _controller) external {
        controller = _controller;
    }
    
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x3b3b57de; // IAddrResolver interface
    }
    
    function interfaceImplementer(bytes32, bytes4 interfaceId) external view returns (address) {
        if (interfaceId == type(IETHRegistrarController).interfaceId) {
            return controller;
        }
        return address(0);
    }
}

/**
 * @title TestBulkRenewal
 * @dev Complete BulkRenewal functionality tests
 */
contract TestBulkRenewal is BaseTest {
    
    // Note: BaseTest provides: ens, baseRegistrar, controller, priceOracle, dummyOracle, 
    // nameWrapper, metadataService, reverseRegistrar, publicResolver
    // and standard accounts: USER1, USER2, USER3
    // and constants: ZERO_HASH, ETH_NODE, REVERSE_NODE, DAY, REGISTRATION_TIME, BUFFERED_REGISTRATION_COST
    
    BulkRenewal public bulkRenewal;
    MockETHResolver public mockResolver;
    
    // Test accounts for this specific test
    address public account0;
    address public account1;
    address public account2;
    address[] public accounts;
    
    // Test name constants
    string constant TEST1_LABEL = "test1";
    string constant TEST2_LABEL = "test2";
    string constant TEST3_LABEL = "test3";
    
    // Constructor parameters
    uint256 constant REGISTRATION_DURATION = 31536000; // 31536000n (1 year)
    
    // Note: toLabelId and namehash are provided by BaseTest
    
    function getETHRegistrarControllerInterfaceId() internal pure returns (bytes4) {
        return type(IETHRegistrarController).interfaceId;
    }
    
    function setUp() public override {
        super.setUp();
        
        // Set up test accounts using BaseTest's accounts
        account0 = TestAccounts.owner(); // Use the same owner as BaseTest
        account1 = USER1;
        account2 = USER2;
        accounts.push(account0);
        accounts.push(account1);
        accounts.push(account2);
        
        // Fund additional test accounts if needed (BaseTest already funds USER1-3)
        fundAccount(account0, 100 ether);
        fundAccount(account1, 100 ether);
        fundAccount(account2, 100 ether);
        
        vm.startPrank(account0);
        
        // Create the bulk renewal contract using BaseTest's ens registry
        bulkRenewal = new BulkRenewal(ens);
        
        // Create mock resolver and configure it to return the controller
        mockResolver = new MockETHResolver();
        mockResolver.setController(address(controller));
        
        // Set the mock resolver for the .eth node so BulkRenewal can find the controller
        // The BaseRegistrar owns the ETH_NODE, so we need to use its setResolver function
        baseRegistrar.setResolver(address(mockResolver));
        
        // Add account0 as a controller so it can register names directly
        baseRegistrar.addController(account0);
        
        // Register test names using BaseTest's baseRegistrar
        string[3] memory testNames = [TEST1_LABEL, TEST2_LABEL, TEST3_LABEL];
        for (uint i = 0; i < testNames.length; i++) {
            baseRegistrar.register(
                toLabelId(testNames[i]),
                account1,
                REGISTRATION_DURATION
            );
        }
        
        vm.stopPrank();
    }
    
    // TEST 1: "should return the cost of a bulk renewal"
    function testShouldReturnTheCostOfABulkRenewal() public {
        string[] memory names = new string[](2);
        names[0] = TEST1_LABEL;
        names[1] = TEST2_LABEL;
        
        uint256 duration = 86400; // 86400n
        uint256 expectedCost = duration * 2; // 86400n * 2n
        
        uint256 actualCost = bulkRenewal.rentPrice(names, duration);
        
        // expect(await bulkRenewal.read.rentPrice([['test1', 'test2'], 86400n])).equal(86400n * 2n)
        assertEq(actualCost, expectedCost, "Bulk renewal cost should match");
    }
    
    // TEST 2: "should raise an error trying to renew a nonexistent name"
    function testShouldRaiseAnErrorTryingToRenewANonexistentName() public {
        string[] memory names = new string[](1);
        names[0] = "foobar"; // nonexistent name
        
        uint256 duration = 86400; // 86400n
        uint256 cost = duration; // Should be duration for 1 name
        
        // expect(await bulkRenewal).write('renewAll', [['foobar'], 86400n]).toBeRevertedWithoutReason()
        vm.expectRevert(bytes("")); // toBeRevertedWithoutReason()
        bulkRenewal.renewAll{value: cost}(names, duration);
    }
    
    // TEST 3: "should permit bulk renewal of names"
    function testShouldPermitBulkRenewalOfNames() public {
        string[] memory names = new string[](2);
        names[0] = TEST1_LABEL;
        names[1] = TEST2_LABEL;
        
        uint256 duration = 86400; // 86400n
        uint256 cost = duration * 2; // 86400n * 2n
        
        // const oldExpiry = await baseRegistrar.read.nameExpires([toLabelId('test2')])
        uint256 oldExpiry = baseRegistrar.nameExpires(toLabelId(TEST2_LABEL));
        
        // await bulkRenewal.write.renewAll([['test1', 'test2'], 86400n], { value: 86400n * 2n })
        bulkRenewal.renewAll{value: cost}(names, duration);
        
        // const newExpiry = await baseRegistrar.read.nameExpires([toLabelId('test2')])
        uint256 newExpiry = baseRegistrar.nameExpires(toLabelId(TEST2_LABEL));
        
        // expect(newExpiry - oldExpiry).equal(86400n)
        assertEq(newExpiry - oldExpiry, duration, "New expiry should be old expiry + duration");
        
        // Check any excess funds are returned
        // expect(await publicClient.getBalance({ address: bulkRenewal.address })).equal(0n)
        assertEq(address(bulkRenewal).balance, 0, "Bulk renewal contract should have no remaining balance");
    }
    
    // Additional tests to ensure complete functionality
    
    function testCompleteFixtureSetup() public {
        assertTrue(address(ens) != address(0), "ENS Registry should be deployed");
        assertTrue(address(baseRegistrar) != address(0), "Base Registrar should be deployed");
        assertTrue(address(bulkRenewal) != address(0), "Bulk Renewal should be deployed");
        assertTrue(address(nameWrapper) != address(0), "Name Wrapper should be deployed");
        assertTrue(address(publicResolver) != address(0), "Public Resolver should be deployed");
        assertTrue(address(controller) != address(0), "Controller should be deployed");
        assertTrue(address(priceOracle) != address(0), "Price Oracle should be deployed");
        assertTrue(address(dummyOracle) != address(0), "Dummy Oracle should be deployed");
        assertTrue(address(reverseRegistrar) != address(0), "Reverse Registrar should be deployed");
        
        // Verify accounts setup
        assertEq(accounts.length, 3, "Should have 3 accounts");
        assertEq(accounts[0], account0, "First account should match");
        assertEq(accounts[1], account1, "Second account should match");
        
        // Verify test names are registered
        assertTrue(baseRegistrar.nameExpires(toLabelId(TEST1_LABEL)) > block.timestamp, "test1 should be registered");
        assertTrue(baseRegistrar.nameExpires(toLabelId(TEST2_LABEL)) > block.timestamp, "test2 should be registered");
        assertTrue(baseRegistrar.nameExpires(toLabelId(TEST3_LABEL)) > block.timestamp, "test3 should be registered");
        
        // Verify ownership
        assertEq(baseRegistrar.ownerOf(toLabelId(TEST1_LABEL)), account1, "test1 should be owned by account1");
        assertEq(baseRegistrar.ownerOf(toLabelId(TEST2_LABEL)), account1, "test2 should be owned by account1");
        assertEq(baseRegistrar.ownerOf(toLabelId(TEST3_LABEL)), account1, "test3 should be owned by account1");
        
        // Verify controller setup
        assertTrue(baseRegistrar.controllers(address(controller)), "Controller should be added to base registrar");
        assertTrue(baseRegistrar.controllers(account0), "Account0 should be controller");
        assertTrue(baseRegistrar.controllers(address(nameWrapper)), "Name wrapper should be controller");
        
        // Verify ENS setup
        assertEq(ens.owner(ETH_NODE), address(baseRegistrar), "Base registrar should own .eth node");
    }
    
    function testRentPriceCalculation() public {
        // Test rent price calculation
        
        // Single name
        string[] memory singleName = new string[](1);
        singleName[0] = TEST1_LABEL;
        assertEq(bulkRenewal.rentPrice(singleName, 86400), 86400, "Single name should cost duration");
        
        // Multiple names
        string[] memory multipleNames = new string[](3);
        multipleNames[0] = TEST1_LABEL;
        multipleNames[1] = TEST2_LABEL;
        multipleNames[2] = TEST3_LABEL;
        assertEq(bulkRenewal.rentPrice(multipleNames, 86400), 86400 * 3, "Multiple names should cost duration * count");
        
        // Zero duration
        assertEq(bulkRenewal.rentPrice(singleName, 0), 0, "Zero duration should cost zero");
        
        // Large duration
        uint256 largeDuration = 365 * 24 * 3600; // 1 year
        assertEq(bulkRenewal.rentPrice(singleName, largeDuration), largeDuration, "Large duration should work");
    }
    
    function testRenewalFunctionality() public {
        // Test complete renewal functionality
        string[] memory names = new string[](2);
        names[0] = TEST1_LABEL;
        names[1] = TEST2_LABEL;
        
        uint256 duration = 86400;
        uint256 cost = duration * 2;
        
        uint256 oldExpiry1 = baseRegistrar.nameExpires(toLabelId(TEST1_LABEL));
        uint256 oldExpiry2 = baseRegistrar.nameExpires(toLabelId(TEST2_LABEL));
        
        // Perform renewal
        uint256 contractBalanceBefore = address(bulkRenewal).balance;
        bulkRenewal.renewAll{value: cost}(names, duration);
        uint256 contractBalanceAfter = address(bulkRenewal).balance;
        
        // Verify both names were renewed
        uint256 newExpiry1 = baseRegistrar.nameExpires(toLabelId(TEST1_LABEL));
        uint256 newExpiry2 = baseRegistrar.nameExpires(toLabelId(TEST2_LABEL));
        
        assertEq(newExpiry1 - oldExpiry1, duration, "First name should be renewed by duration");
        assertEq(newExpiry2 - oldExpiry2, duration, "Second name should be renewed by duration");
        
        // Verify no funds remain in contract
        assertEq(contractBalanceAfter, 0, "Contract should not retain funds");
        assertEq(contractBalanceBefore, 0, "Contract should start with no funds");
    }
    
    function testEdgeCases() public {
        // Empty array
        string[] memory emptyNames = new string[](0);
        assertEq(bulkRenewal.rentPrice(emptyNames, 86400), 0, "Empty array should cost zero");
        
        // This should not revert but also not do anything
        bulkRenewal.renewAll{value: 0}(emptyNames, 86400);
        
        // Very long name array
        string[] memory manyNames = new string[](3);
        manyNames[0] = TEST1_LABEL;
        manyNames[1] = TEST2_LABEL;
        manyNames[2] = TEST3_LABEL;
        
        uint256 duration = 3600; // 1 hour
        uint256 cost = duration * 3;
        
        uint256[] memory oldExpiries = new uint256[](3);
        oldExpiries[0] = baseRegistrar.nameExpires(toLabelId(TEST1_LABEL));
        oldExpiries[1] = baseRegistrar.nameExpires(toLabelId(TEST2_LABEL));
        oldExpiries[2] = baseRegistrar.nameExpires(toLabelId(TEST3_LABEL));
        
        bulkRenewal.renewAll{value: cost}(manyNames, duration);
        
        // Verify all were renewed
        assertEq(baseRegistrar.nameExpires(toLabelId(TEST1_LABEL)) - oldExpiries[0], duration, "Name 1 renewed");
        assertEq(baseRegistrar.nameExpires(toLabelId(TEST2_LABEL)) - oldExpiries[1], duration, "Name 2 renewed");
        assertEq(baseRegistrar.nameExpires(toLabelId(TEST3_LABEL)) - oldExpiries[2], duration, "Name 3 renewed");
    }
    
    function testExcessPaymentHandling() public {
        // Test that excess payment is handled correctly (should be returned)
        string[] memory names = new string[](1);
        names[0] = TEST1_LABEL;
        
        uint256 duration = 86400;
        uint256 exactCost = duration;
        uint256 excessPayment = exactCost + 1 ether;
        
        uint256 balanceBefore = address(this).balance;
        
        bulkRenewal.renewAll{value: excessPayment}(names, duration);
        
        uint256 balanceAfter = address(this).balance;
        
        // Should only pay exact cost, excess should be returned
        assertEq(balanceBefore - balanceAfter, exactCost, "Should only pay exact cost");
        assertEq(address(bulkRenewal).balance, 0, "Contract should not retain funds");
    }
    
    function testInsufficientPayment() public {
        // Test insufficient payment reverts
        string[] memory names = new string[](2);
        names[0] = TEST1_LABEL;
        names[1] = TEST2_LABEL;
        
        uint256 duration = 86400;
        uint256 requiredCost = duration * 2;
        uint256 insufficientPayment = requiredCost - 1;
        
        vm.expectRevert(bytes(""));
        bulkRenewal.renewAll{value: insufficientPayment}(names, duration);
    }
    
    // Helper function to receive ETH (for excess payment tests)
    receive() external payable {}
}
