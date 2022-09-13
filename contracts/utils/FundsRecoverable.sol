//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
    @notice Contract is used to recover ERC20 tokens sent to the contract by mistake.
 */

contract FundsRecoverable is Ownable {
    /**
    @notice Recover ERC20 tokens sent to the contract by mistake.
    @dev The contract is Ownable and only the owner can call the recover function.
    @param _to The address to send the tokens to.
    @param _token The address of the ERC20 token to recover. 0x0 for ETH.
    @param _amount The amount of tokens to recover.
 */
    function recoverFunds(
        address payable _to,
        address _token,
        uint256 _amount
    ) external onlyOwner {
        if (_token == address(0)) {
            _to.transfer(_amount);
        } else {
            IERC20(_token).transfer(_to, _amount);
        }
    }
}
