// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IERC7996} from "../../utils/IERC7996.sol";
import {IAddrResolver} from "../../resolvers/profiles/IAddrResolver.sol";

contract MockRevertingERC7996Resolver is ERC165, IERC7996, IAddrResolver {
    bytes public revertData;
    constructor(bytes memory v) {
        revertData = v;
    }
    function setRevertData(bytes calldata v) external {
        revertData = v;
    }
    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IERC7996).interfaceId &&
            super.supportsInterface(interfaceId);
    }
    function supportsFeature(bytes4) external view returns (bool) {
        bytes memory v = revertData;
        assembly {
            revert(add(v, 32), mload(v))
        }
    }
    function addr(bytes32) external view returns (address payable) {
        return payable(address(this));
    }
}
