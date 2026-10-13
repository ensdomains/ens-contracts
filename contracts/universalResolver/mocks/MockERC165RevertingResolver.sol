// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IAddrResolver} from "../../resolvers/profiles/IAddrResolver.sol";

contract MockERC165RevertingResolver is IERC165, IAddrResolver {
    bytes public revertData;
    constructor(bytes memory v) {
        revertData = v;
    }
    function setRevertData(bytes calldata v) external {
        revertData = v;
    }
    function supportsInterface(bytes4) external view returns (bool) {
        bytes memory v = revertData;
        assembly {
            revert(add(v, 32), mload(v))
        }
    }
    function addr(bytes32) external view returns (address payable) {
        return payable(address(this));
    }
}
