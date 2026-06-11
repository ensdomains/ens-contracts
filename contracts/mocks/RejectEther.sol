//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

/// @notice Test mock that rejects all incoming ETH. Used to drive the
///         `TransferFailed` branches in SimplexController's refund / withdraw
///         paths (register refund, renew refund, withdraw).
contract RejectEther {
    receive() external payable {
        revert("RejectEther: rejected");
    }
}
