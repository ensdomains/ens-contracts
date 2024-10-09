// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../universalResolver/ERC3668Caller.sol";
import "hardhat/console.sol";

contract TestUserCallbackFunctions is ERC3668Caller {
    function testCreateUserCallbackFunctions() public view {
        bytes4 internalCallbackFunction = bytes4(0x11111111);
        bytes4 calldataRewriteFunction = bytes4(0x22222222);
        bytes4 failureCallbackFunction = bytes4(0x33333333);
        bytes4 validateResponseFunction = bytes4(0x44444444);

        uint256 gasBefore = gasleft();
        uint256 callbackFunctions = createUserCallbackFunctions(
            internalCallbackFunction,
            calldataRewriteFunction,
            failureCallbackFunction,
            validateResponseFunction
        );
        uint256 gasAfter = gasleft();
        console.log("gas", gasBefore - gasAfter);

        console.logBytes32(bytes32(callbackFunctions));

        require(
            callbackFunctions ==
                0x0000000000000000000000000000000044444444333333332222222211111111,
            "Callback functions should be correct"
        );
    }
}
