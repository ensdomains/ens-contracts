// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IHasAddressResolver {
    function hasAddr(
        bytes32 node,
        uint256 coinType
    ) external view returns (bool);
}
