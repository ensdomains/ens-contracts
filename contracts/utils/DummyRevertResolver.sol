// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

contract DummyRevertResolver {
    function resolve(
        bytes calldata,
        bytes calldata
    ) external pure returns (bytes memory) {
        revert("Not Supported");
    }

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }
}
