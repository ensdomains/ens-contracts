// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC7996} from "./IERC7996.sol";

/// @notice Library for statically-checking for ERC-7996 support, like `ERC165Checker`.
library ERC7996Checker {
    /// @notice Determine if `target` supports ERC-7996 `featureId` without checking ERC-165 interfaces.
    function supportsFeatureUnchecked(
        address target,
        bytes4 featureId
    ) internal view returns (bool) {
        bytes memory callData = abi.encodeCall(
            IERC7996.supportsFeature,
            (featureId)
        );
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := staticcall(
                30000,
                target,
                add(callData, 0x20),
                mload(callData),
                0x00,
                0x20
            )
            returnSize := returndatasize()
            returnValue := mload(0x00)
        }
        return success && returnSize >= 0x20 && returnValue > 0;
    }
}
