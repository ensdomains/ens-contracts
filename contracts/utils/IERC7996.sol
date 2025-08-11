// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface for expressing contract features not visible from the ABI.
/// @dev Interface selector: `0x582de3e7`
interface IERC7996 {
    /// @notice Check if a feature is supported.
    /// @param featureId The feature identifier.
    /// @return `true` if the feature is supported by the contract.
    function supportsFeature(bytes4 featureId) external view returns (bool);
}
