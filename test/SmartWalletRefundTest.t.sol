// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

// Mock smart contract wallet (e.g., Gnosis Safe, Argent, or ERC-4337 Smart Account)
// which records received ETH or dispatches to a fallback module
contract MockSmartAccount {
    event ReceivedEther(address indexed sender, uint256 amount);
    uint256 public totalReceived;

    receive() external payable {
        // State writes (SSTORE) or multi-sig event tracking consume > 2300 gas,
        // which triggers an Out-of-Gas revert with .transfer() (2300 gas stipend)
        totalReceived += msg.value;
        emit ReceivedEther(msg.sender, msg.value);
    }
}

// Contract simulating the current ENS ETHRegistrarController / BulkRenewal refund pattern (.transfer)
contract LegacyRefundPattern {
    function processWithTransfer(address payable recipient) external payable {
        require(msg.value >= 1 ether, "Insufficient payment");
        uint256 fee = 1 ether;
        uint256 refund = msg.value - fee;
        if (refund > 0) {
            // Reverts if recipient needs > 2300 gas
            recipient.transfer(refund);
        }
    }
}

// Contract simulating the recommended safe refund pattern (.call)
contract ModernRefundPattern {
    function processWithCall(address payable recipient) external payable {
        require(msg.value >= 1 ether, "Insufficient payment");
        uint256 fee = 1 ether;
        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (bool success, ) = recipient.call{value: refund}("");
            require(success, "Refund failed");
        }
    }
}

contract SmartWalletRefundTest is Test {
    MockSmartAccount public smartAccount;
    LegacyRefundPattern public legacyContract;
    ModernRefundPattern public modernContract;

    function setUp() public {
        smartAccount = new MockSmartAccount();
        legacyContract = new LegacyRefundPattern();
        modernContract = new ModernRefundPattern();
        vm.deal(address(this), 100 ether);
    }

    function test_legacyTransferRevertsForSmartWallet() public {
        // Send 1.5 ETH (0.5 ETH should be refunded)
        // With .transfer(), this should fail due to gas stipend limitation (Out of Gas in receive())
        vm.expectRevert();
        legacyContract.processWithTransfer{value: 1.5 ether}(payable(address(smartAccount)));
    }

    function test_modernCallSucceedsForSmartWallet() public {
        uint256 initialBalance = address(smartAccount).balance;
        
        // Send 1.5 ETH (0.5 ETH should be refunded)
        modernContract.processWithCall{value: 1.5 ether}(payable(address(smartAccount)));
        
        uint256 finalBalance = address(smartAccount).balance;
        assertEq(finalBalance - initialBalance, 0.5 ether, "Smart account should receive full 0.5 ETH refund");
    }
}
