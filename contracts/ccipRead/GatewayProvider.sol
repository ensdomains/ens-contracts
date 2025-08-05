// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";

import {IGatewayProvider} from "./IGatewayProvider.sol";

contract GatewayProvider is Ownable, IGatewayProvider {
    string[] _urls;

    constructor(address owner, string[] memory urls) Ownable(owner) {
        _urls = urls;
    }

    /// @inheritdoc IGatewayProvider
    function gateways() external view returns (string[] memory) {
        return _urls;
    }

    /// @notice Set the gateways.
    /// @param urls The gateway URLs.
    function setGateways(string[] memory urls) external onlyOwner {
        _urls = urls;
    }
}
