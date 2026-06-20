//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IMetadataRenderer {
    /// @dev Returns the ERC-721 token metadata URI for a name.
    /// @param tokenId The token ID (labelhash of the 2LD label).
    /// @param label The plaintext label, supplied by the registrar.
    function tokenURI(
        uint256 tokenId,
        string calldata label
    ) external view returns (string memory);
}
