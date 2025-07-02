// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/resolvers/profiles/ExtendedResolver.sol";

/**
 * @title TestExtendedResolver
 * @dev Tests for ExtendedResolver contract functionality
 * Tests the actual ExtendedResolver.sol contract by creating implementations that extend it
 */
contract TestExtendedResolver is Test {
    TestableExtendedResolver public resolver;
    MinimalExtendedResolver public minimalResolver;
    
    function setUp() public {
        resolver = new TestableExtendedResolver();
        minimalResolver = new MinimalExtendedResolver();
    }
    
    function testResolveCallsItselfSuccessfully() public view {
        // Test that resolve() can successfully call a function on itself
        bytes memory data = abi.encodeWithSignature("getValue()");
        
        bytes memory result = resolver.resolve("", data);
        uint256 decoded = abi.decode(result, (uint256));
        
        assertEq(decoded, 42, "Should return value from self-call");
    }
    
    function testResolveWithMultipleParameters() public view {
        // Test calling a function with multiple parameters
        bytes memory data = abi.encodeWithSignature("add(uint256,uint256)", 15, 25);
        
        bytes memory result = resolver.resolve("", data);
        uint256 decoded = abi.decode(result, (uint256));
        
        assertEq(decoded, 40, "Should return sum from self-call");
    }
    
    function testResolveWithStringParameter() public view {
        // Test calling a function with string parameter
        bytes memory data = abi.encodeWithSignature("echo(string)", "hello resolver");
        
        bytes memory result = resolver.resolve("", data);
        string memory decoded = abi.decode(result, (string));
        
        assertEq(decoded, "hello resolver", "Should echo string from self-call");
    }
    
    function testResolveIgnoresNameParameter() public view {
        // Test that name parameter is ignored (as indicated by /* name */)
        bytes memory data = abi.encodeWithSignature("getValue()");
        
        bytes memory result1 = resolver.resolve("", data);
        bytes memory result2 = resolver.resolve("test.eth", data);
        bytes memory result3 = resolver.resolve(hex"1234", data);
        
        assertEq(result1, result2, "Different names should produce same result");
        assertEq(result2, result3, "Different names should produce same result");
    }
    
    function testResolveRevertsOnNonExistentFunction() public {
        // Test that calling non-existent function reverts
        bytes memory data = abi.encodeWithSignature("nonExistent()");
        
        vm.expectRevert(bytes(""));
        resolver.resolve("", data);
    }
    
    function testResolveRevertsOnRevertingFunction() public {
        // Test that reverting function causes resolve to revert with exact message
        bytes memory data = abi.encodeWithSignature("alwaysReverts()");
        
        vm.expectRevert(bytes("Test revert"));
        resolver.resolve("", data);
    }
    
    function testResolveForwardsCustomError() public {
        // Test that custom errors are properly forwarded
        bytes memory data = abi.encodeWithSignature("throwCustomError()");
        
        vm.expectRevert(abi.encodeWithSignature("TestError(uint256)", 456));
        resolver.resolve("", data);
    }
    
    function testResolveWithComplexReturnData() public view {
        // Test with multiple return values
        bytes memory data = abi.encodeWithSignature("getMultipleValues()");
        
        bytes memory result = resolver.resolve("", data);
        (uint256 num, bool flag, string memory text) = abi.decode(result, (uint256, bool, string));
        
        assertEq(num, 123, "Should return correct number");
        assertTrue(flag, "Should return correct boolean");
        assertEq(text, "test", "Should return correct string");
    }
    
    function testResolveWithEmptyReturnData() public view {
        // Test function that returns nothing
        bytes memory data = abi.encodeWithSignature("doNothing()");
        
        bytes memory result = resolver.resolve("", data);
        
        assertEq(result.length, 0, "Should return empty data");
    }
    
    function testResolvePreservesRevertData() public {
        // Test that revert data is properly preserved
        bytes memory data = abi.encodeWithSignature("revertWithData(string)", "custom message");
        
        vm.expectRevert(bytes("custom message"));
        resolver.resolve("", data);
    }
    
    function testResolveFailsOnStateChangingFunction() public {
        // Test that state-changing functions fail in staticcall
        bytes memory data = abi.encodeWithSignature("stateChangingFunction()");
        
        vm.expectRevert(bytes(""));
        resolver.resolve("", data);
    }
    
    function testResolveWithMinimalImplementation() public view {
        // Test with minimal resolver that just has one function
        bytes memory data = abi.encodeWithSignature("simpleFunction()");
        
        bytes memory result = minimalResolver.resolve("", data);
        bool decoded = abi.decode(result, (bool));
        
        assertTrue(decoded, "Minimal resolver should work");
    }
    
    function testResolveAssemblyErrorForwarding() public {
        // Test that the assembly error forwarding works correctly
        bytes memory data = abi.encodeWithSignature("revertWithSpecificData()");
        
        vm.expectRevert(bytes("specific assembly test"));
        resolver.resolve("", data);
    }
    
    function testResolveGasEfficiency() public view {
        // Test gas usage for simple call
        bytes memory data = abi.encodeWithSignature("getValue()");
        
        uint256 gasBefore = gasleft();
        resolver.resolve("", data);
        uint256 gasUsed = gasBefore - gasleft();
        
        assertLt(gasUsed, 10000, "Should be gas efficient");
    }
    
    function testResolveWithViewFunction() public view {
        // Test view function works with staticcall
        bytes memory data = abi.encodeWithSignature("viewFunction()");
        
        bytes memory result = resolver.resolve("", data);
        uint256 decoded = abi.decode(result, (uint256));
        
        assertEq(decoded, 777, "View function should work in staticcall");
    }
    
    function testResolveWithPureFunction() public view {
        // Test pure function works with staticcall
        bytes memory data = abi.encodeWithSignature("pureFunction()");
        
        bytes memory result = resolver.resolve("", data);
        uint256 decoded = abi.decode(result, (uint256));
        
        assertEq(decoded, 999, "Pure function should work in staticcall");
    }
}

/**
 * @title TestableExtendedResolver
 * @dev Extended resolver with test functions to demonstrate self-calling behavior
 */
contract TestableExtendedResolver is ExtendedResolver {
    uint256 private state = 100;
    
    error TestError(uint256 code);
    
    function getValue() external pure returns (uint256) {
        return 42;
    }
    
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }
    
    function echo(string memory input) external pure returns (string memory) {
        return input;
    }
    
    function alwaysReverts() external pure {
        revert("Test revert");
    }
    
    function throwCustomError() external pure {
        revert TestError(456);
    }
    
    function getMultipleValues() external pure returns (uint256, bool, string memory) {
        return (123, true, "test");
    }
    
    function doNothing() external pure {
        // Returns nothing
    }
    
    function revertWithData(string memory message) external pure {
        revert(message);
    }
    
    function revertWithSpecificData() external pure {
        revert("specific assembly test");
    }
    
    function pureFunction() external pure returns (uint256) {
        return 999;
    }
    
    function viewFunction() external pure returns (uint256) {
        return 777;
    }
    
    function stateChangingFunction() external returns (uint256) {
        state = 200; // This will fail in staticcall
        return state;
    }
}

/**
 * @title MinimalExtendedResolver
 * @dev Minimal implementation to test basic ExtendedResolver functionality
 */
contract MinimalExtendedResolver is ExtendedResolver {
    function simpleFunction() external pure returns (bool) {
        return true;
    }
}
