// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {ResolverFeatures} from "../resolvers/ResolverFeatures.sol";
import {ERC7996Checker} from "./ERC7996Checker.sol";
import {IERC7996} from "./IERC7996.sol";

contract TestERC7996Checker {
    function supportsFeatureUnchecked(
        address target,
        bytes4 featureId
    ) external view returns (bool) {
        return ERC7996Checker.supportsFeatureUnchecked(target, featureId);
    }

    /// @dev Passes a feature constant defined as `bytes4(keccak256(...))`.
    function supportsResolveMulticall(
        address target
    ) external view returns (bool) {
        return
            ERC7996Checker.supportsFeatureUnchecked(
                target,
                ResolverFeatures.RESOLVE_MULTICALL
            );
    }

    /// @dev Checks ERC-165 support for ERC-7996 first, like `UniversalResolver` and `ResolverCaller`.
    function supportsFeatureAfterERC165(
        address target,
        bytes4 featureId
    ) external view returns (bool) {
        return
            ERC165Checker.supportsERC165InterfaceUnchecked(
                target,
                type(IERC7996).interfaceId
            ) && ERC7996Checker.supportsFeatureUnchecked(target, featureId);
    }
}
