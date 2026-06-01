//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

/// @notice Test mock representing a smart-contract account whose
///         receive() does more than the 2300-gas stipend allows.
///         Used to prove SimplexController's refund/withdraw paths
///         work for multisigs, account-abstraction wallets, etc.
///         A plain SSTORE costs >2300 gas, so this would revert if
///         the caller used `.transfer()`.
contract GasHogReceiver {
    uint256 public lastReceived;

    receive() external payable {
        lastReceived = block.timestamp;
    }
}
