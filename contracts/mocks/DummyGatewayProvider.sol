//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

contract DummyGatewayProvider {
    function gateways() external pure returns (string[] memory) {
        return new string[](0);
    }
}
