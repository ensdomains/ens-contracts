// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * @notice No resolver is set for `name` according to ENSIP-10
 */
error UnreachableName(bytes name);

/**
 * @notice The resolver does not implement `selector`
 */
error UnsupportedResolverProfile(bytes4 selector);

interface IExtendedResolver {
    function resolve(
        bytes memory name,
        bytes memory data
    ) external view returns (bytes memory);
}
