// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IExtendedResolver {
    function supportsInterface(bytes4 interfaceID) external pure returns(bool);
    function resolve(bytes memory name, bytes memory data) external view returns(bytes memory);
}
