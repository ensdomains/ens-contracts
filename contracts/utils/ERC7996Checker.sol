// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC7996} from "./IERC7996.sol";

/// @notice Library for statically-checking for ERC-7996 support, like `ERC165Checker`.
library ERC7996Checker {
    /// @notice Determine if `target` supports ERC-7996 `featureId` without checking ERC-165 interfaces.
    function supportsFeatureUnchecked(
        address target,
        bytes4 featureId
    ) internal view returns (bool supported) {
        // modified from: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.7/contracts/utils/introspection/ERC165Checker.sol#L130
        bytes4 selector = IERC7996.supportsFeature.selector;
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            mstore(0x00, selector)
            // clear the low-order bits, which may be dirty (eg. `bytes4(keccak256(...))`)
            mstore(0x04, shl(224, shr(224, featureId)))
            // read returndata only after the call, since Yul evaluates arguments right-to-left
            success := staticcall(30000, target, 0x00, 0x24, 0x00, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0x00)
        }
        return success && returnSize >= 0x20 && returnValue > 0;
    }
}
