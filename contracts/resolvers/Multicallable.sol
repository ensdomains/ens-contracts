// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./IMulticallable.sol";
import "./SupportsInterface.sol";

abstract contract Multicallable is IMulticallable, SupportsInterface {
    function multicall(bytes[] calldata data) external override returns(bytes[] memory results) {
        results = new bytes[](data.length);
        for(uint i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            require(success);
            results[i] = result;
        }
        return results;
    }

    function supportsInterface(bytes4 interfaceID) public override virtual pure returns(bool) {
        return interfaceID == type(IMulticallable).interfaceId || super.supportsInterface(interfaceID);
    }
}
