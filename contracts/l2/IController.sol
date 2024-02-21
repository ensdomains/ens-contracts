// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IController {
    function ownerOfWithData(
        bytes calldata tokenData
    ) external view returns (address);

    function ownerOf(bytes32 node) external view returns (address);

    function safeTransferFrom(
        bytes calldata tokenData,
        address sender,
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data,
        bool isApproved
    ) external returns (bytes memory);

    function burn(
        bytes calldata tokenData,
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data,
        bool operatorApproved
    ) external view returns (bytes memory);

    function balanceOf(
        bytes calldata tokenData,
        address owner,
        uint256 id
    ) external view returns (uint256);

    function resolverFor(
        bytes calldata tokenData
    ) external view returns (address);
}
