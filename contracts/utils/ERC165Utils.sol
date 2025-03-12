// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

library ERC165Utils {
    /// @dev Determine if `target` supports `selector` w/o gas concerns
    function supportsInterface(
        address target,
        bytes4 selector
    ) internal view returns (bool ret) {
        // https://eips.ethereum.org/EIPS/eip-165
        try IERC165(target).supportsInterface{gas: 30000}(selector) returns (
            bool quacks
        ) {
            ret = quacks;
        } catch {}
    }
}
