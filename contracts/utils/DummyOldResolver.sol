// SPDX-License-Identifier: MIT
pragma solidity 0.4.11;

contract DummyOldResolver {
    function test() public returns (bool) {
        return true;
    }

    function name(bytes32) public returns (string memory) {
        return "oldprimary.eth";
    }

    function addr(bytes32) public returns (address) {
        return 0xBcd4042DE499D14e55001CcbB24a551F3b954096;
    }
}
