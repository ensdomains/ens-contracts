// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IHasAddressResolver {
    /// @notice Determine if an addresss is stored for the coin type of the associated ENS node.
    /// @param node The node to query.
    /// @param coinType The coin type.
    /// @return True if the associated address is not empty.
    function hasAddr(
        bytes32 node,
        uint256 coinType
    ) external view returns (bool);
}
