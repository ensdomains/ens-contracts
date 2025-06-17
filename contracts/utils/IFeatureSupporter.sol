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

/// @notice Determine if a feature is implemented by the contract.
/// @param target The contract.
/// @param feature The feature.
/// @return True if the feature is supported.
function isFeatureSupported(address target, bytes4 feature) view returns (bool) {
    bytes memory v = abi.encodeCall(
        IFeatureSupporter.supportsFeature,
        (feature)
    );
    bool success;
    uint256 returnSize;
    uint256 returnValue;
    assembly {
        success := staticcall(30000, target, add(v, 32), mload(v), 0, 32)
        returnSize := returndatasize()
        returnValue := mload(0)
    }
    return success && returnSize >= 32 && returnValue > 0;
}
