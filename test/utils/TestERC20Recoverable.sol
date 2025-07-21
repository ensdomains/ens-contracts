// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../../contracts/utils/ERC20Recoverable.sol";
import "../../contracts/test/mocks/MockERC20.sol";

/**
 * @title TestERC20Recoverable
 * @dev Tests ERC20 token recovery functionality for contracts that can rescue accidentally sent tokens
 */
contract TestERC20Recoverable is Test {
    ERC20Recoverable public erc20Recoverable;
    MockERC20 public erc20Token;

    address public account0;
    address public account1;

    function setUp() public {
        // Create test accounts
        account0 = address(0x1111);
        account1 = address(0x2222);

        // Deploy contracts
        erc20Recoverable = new ERC20Recoverable();
        erc20Token = new MockERC20(
            "Ethereum Name Service Token",
            "ENS",
            new address[](0)
        );

        vm.label(account0, "account0");
        vm.label(account1, "account1");
    }

    /**
     * Test 1: 'should recover ERC20 token'
     * Tests basic ERC20 token recovery functionality
     */
    function testShouldRecoverERC20Token() public {
        // Transfer tokens to the recoverable contract
        erc20Token.transfer(address(erc20Recoverable), 1000);

        // Verify transfer worked
        assertEq(
            erc20Token.balanceOf(address(erc20Recoverable)),
            1000,
            "Contract should have 1000 tokens"
        );

        // Recover the funds to account0 (accounts[0].address)
        erc20Recoverable.recoverFunds(address(erc20Token), account0, 1000);

        // Verify recovery worked
        assertEq(
            erc20Token.balanceOf(address(erc20Recoverable)),
            0,
            "Contract should have 0 tokens after recovery"
        );
    }

    /**
     * Test 2: 'should not allow non-owner to call'
     * Tests that non-owners cannot call recoverFunds
     */
    function testShouldNotAllowNonOwnerToCall() public {
        // Transfer tokens to the recoverable contract
        erc20Token.transfer(address(erc20Recoverable), 1000);

        // Verify transfer worked
        assertEq(
            erc20Token.balanceOf(address(erc20Recoverable)),
            1000,
            "Contract should have 1000 tokens"
        );

        // Try to recover as account1 (non-owner) - should revert with owner message
        vm.prank(account1);
        vm.expectRevert("Ownable: caller is not the owner");
        erc20Recoverable.recoverFunds(address(erc20Token), account1, 1000);
    }
}
