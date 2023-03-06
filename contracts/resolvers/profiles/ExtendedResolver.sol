// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract ExtendedResolver {
    function resolve(
        bytes memory /* name */,
        bytes memory data
    ) external view returns (bytes memory) {
        (bool success, bytes memory result) = address(this).staticcall(data);
        if (success) {
            return result;
        } else {
            // Revert with the reason provided by the call
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
    }
}
