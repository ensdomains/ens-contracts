// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface for expressing contract features not visible from the ABI.
/// @dev Interface selector: `0x582de3e7`
interface IFeatureSupporter {
    /// @notice Check if a feature is supported.
    /// @param feature The feature.
    /// @return True if the feature is supported by the contract.
    function supportsFeature(bytes4 feature) external view returns (bool);
}
