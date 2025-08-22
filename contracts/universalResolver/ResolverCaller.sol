// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {CCIPBatcher} from "../ccipRead/CCIPBatcher.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";
import {IERC7996} from "../utils/IERC7996.sol";
import {ResolverFeatures} from "../resolvers/ResolverFeatures.sol";

// resolver profiles
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {IMulticallable} from "../resolvers/IMulticallable.sol";

abstract contract ResolverCaller is CCIPBatcher {
    /// @dev `name` cannot be resolved.
    ///      Error selector: `0x5fe9a5df`
    /// @param name The DNS-encoded ENS name.
    error UnreachableName(bytes name);

    /// @notice Perform forward resolution.
    ///
    /// If ENSIP-22 is supported, performs a direct call.
    /// Call this function with `ccipRead()` to intercept the response.
    ///
    /// 1. if `IExtendedResolver`, `resolver.resolve(name, calldata)`.
    /// 2. otherwise, `resolver.staticall(calldata)`.
    ///
    /// - If (1), the calldata is not `multicall()`, and the resolver supports features,
    ///   the call is performed directly without the batch gateway.
    /// - If (1), the calldata is `multicall()`, and the resolver supports `RESOLVE_MULTICALL` feature,
    ///   the call is performed directly without the batch gateway.
    /// - Otherwise, the call is performed with the batch gateway.
    ///   If the calldata is `multicall()`, it is disassembled, called separately, and reassembled.
    ///
    /// @dev Reverts `UnreachableName` if resolver is not a contract.
    /// @param resolver The resolver to call.
    /// @param name The DNS-encoded ENS name.
    /// @param data The calldata for the resolution.
    /// @param batchGateways The batch gateway URLs.
    function callResolver(
        address resolver,
        bytes memory name,
        bytes memory data,
        string[] memory batchGateways
    ) public view returns (bytes memory) {
        if (resolver.code.length == 0) {
            revert UnreachableName(name);
        }
        bool multi = bytes4(data) == IMulticallable.multicall.selector;
        bool extended = ERC165Checker.supportsERC165InterfaceUnchecked(
            resolver,
            type(IExtendedResolver).interfaceId
        );
        if (
            ERC165Checker.supportsERC165InterfaceUnchecked(
                resolver,
                type(IERC7996).interfaceId
            ) &&
            (!multi ||
                (extended &&
                    IERC7996(resolver).supportsFeature(
                        ResolverFeatures.RESOLVE_MULTICALL
                    )))
        ) {
            if (extended) {
                // resolve() has the same return signature as callResolver()
                ccipRead(
                    resolver,
                    abi.encodeCall(IExtendedResolver.resolve, (name, data))
                );
            } else {
                ccipRead(
                    resolver,
                    data,
                    this.resolveDirectImmediateCallback.selector, // ==> step 2
                    IDENTITY_FUNCTION,
                    ""
                );
            }
        }
        bytes[] memory calls;
        if (multi) {
            calls = abi.decode(
                BytesUtils.substring(data, 4, data.length - 4),
                (bytes[])
            );
        } else {
            calls = new bytes[](1);
            calls[0] = data;
        }
        if (extended) {
            for (uint256 i; i < calls.length; ++i) {
                calls[i] = abi.encodeCall(
                    IExtendedResolver.resolve,
                    (name, calls[i])
                );
            }
        }
        ccipRead(
            address(this),
            abi.encodeCall(
                this.ccipBatch,
                (createBatch(resolver, calls, batchGateways))
            ),
            this.resolveBatchCallback.selector, // ==> step 2
            IDENTITY_FUNCTION,
            abi.encode(multi, extended)
        );
    }

    /// @dev CCIP-Read callback for `callResolver()` from direct calling an immediate resolver.
    function resolveDirectImmediateCallback(
        bytes calldata response,
        bytes calldata
    ) external pure returns (bytes calldata) {
        return response; // the calldata was direct, so wrap it
    }

    /// @dev CCIP-Read callback for `callResolver()` from batch calling a resolver.
    /// @param response The response data from the batch gateway.
    /// @param extraData The abi-encoded properties of the call.
    /// @return result The response from the resolver.
    function resolveBatchCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (bytes memory) {
        Lookup[] memory lookups = abi.decode(response, (Batch)).lookups;
        (bool multi, bool extended) = abi.decode(extraData, (bool, bool));
        if (multi) {
            bytes[] memory m = new bytes[](lookups.length);
            for (uint256 i; i < lookups.length; ++i) {
                Lookup memory lu = lookups[i];
                bytes memory v = lu.data;
                if (extended && (lu.flags & FLAGS_ANY_ERROR) == 0) {
                    v = abi.decode(v, (bytes)); // unwrap resolve()
                }
                m[i] = v;
            }
            return abi.encode(m);
        } else {
            Lookup memory lu = lookups[0];
            bytes memory v = lu.data;
            if ((lu.flags & FLAGS_ANY_ERROR) != 0) {
                assembly {
                    revert(add(v, 32), mload(v))
                }
            }
            if (extended) {
                v = abi.decode(v, (bytes)); // unwrap resolve()
            }
            return v;
        }
    }
}
