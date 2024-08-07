// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IL2ReverseResolver {
    function setName(string memory name) external returns (bytes32);

    function setNameForAddr(
        address addr,
        string memory name
    ) external returns (bytes32);

    function setNameForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    ) external returns (bytes32);
}
