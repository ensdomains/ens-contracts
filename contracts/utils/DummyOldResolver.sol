// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

contract DummyOldResolver {
    function test() public pure returns (bool) {
        return true;
    }

    function name(bytes32) public pure returns (string memory) {
        return "test.eth";
    }
}
