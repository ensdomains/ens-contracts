// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {IUniversalResolver} from "./IUniversalResolver.sol";
import {CCIPBatcher, CCIPReader} from "../ccipRead/CCIPBatcher.sol";
import {IGatewayProvider} from "../ccipRead/IGatewayProvider.sol";
import {NameCoder} from "../utils/NameCoder.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";
import {ENSIP19, COIN_TYPE_ETH, COIN_TYPE_DEFAULT} from "../utils/ENSIP19.sol";
import {IFeatureSupporter} from "../utils/IFeatureSupporter.sol";
import {ResolverFeatures} from "../resolvers/ResolverFeatures.sol";

// resolver profiles
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IMulticallable} from "../resolvers/IMulticallable.sol";

abstract contract AbstractUniversalResolver is
    IUniversalResolver,
    CCIPBatcher,
    ERC165
{
    /// @dev The default batch gateways.
    IGatewayProvider public immutable batchGatewayProvider;

    constructor(
        IGatewayProvider _batchGatewayProvider
    ) CCIPReader(DEFAULT_UNSAFE_CALL_GAS) {
        batchGatewayProvider = _batchGatewayProvider;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165) returns (bool) {
        return
            type(IUniversalResolver).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IUniversalResolver
    function findResolver(
        bytes memory name
    ) public view virtual returns (address, bytes32, uint256);

    /// @dev A valid resolver and its relevant properties.
    struct ResolverInfo {
        bytes name; // dns-encoded name (safe to decode)
        uint256 offset; // byte offset into name used for resolver
        bytes32 node; // namehash(name)
        address resolver;
        bool extended; // IExtendedResolver
    }

    /// @dev Returns a valid resolver for `name` or reverts.
    /// @param name The name to search.
    /// @return info The resolver information.
    function requireResolver(
        bytes memory name
    ) public view returns (ResolverInfo memory info) {
        // https://docs.ens.domains/ensip/10
        (info.resolver, info.node, info.offset) = findResolver(name);
        info.name = name;
        _checkResolver(info);
    }

    /// @dev Asserts that the resolver information is valid.
    function _checkResolver(ResolverInfo memory info) internal view {
        if (info.resolver == address(0)) {
            revert ResolverNotFound(info.name);
        } else if (
            ERC165Checker.supportsERC165InterfaceUnchecked(
                info.resolver,
                type(IExtendedResolver).interfaceId
            )
        ) {
            info.extended = true;
        } else if (info.offset != 0) {
            revert ResolverNotFound(info.name); // immediate resolver requires exact match
        } else if (info.resolver.code.length == 0) {
            revert ResolverNotContract(info.name, info.resolver);
        }
    }

    /// @notice Same as `resolveWithGateways()` but uses default batch gateways.
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory, address) {
        return resolveWithGateways(name, data, batchGatewayProvider.gateways());
    }

    /// @notice Performs ENS resolution process for the supplied name and resolution data.
    ///         Caller should enable EIP-3668.
    /// @dev This function executes over multiple steps.
    /// @param name The name to resolve, in normalised and DNS-encoded form.
    /// @param data The resolution data, as specified in ENSIP-10.
    /// @param gateways The list of batch gateway URLs to use.
    /// @return result The encoded response for the requested call.
    /// @return resolver The address of the resolver that supplied `result`.
    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory result, address resolver) {
        result;
        resolver;
        ResolverInfo memory info = requireResolver(name);
        _callResolver(
            info,
            data,
            gateways,
            this.resolveCallback.selector, // ==> step 2
            abi.encode(info.resolver)
        );
    }

    /// @notice Same as `resolveWithGateways()` but uses the supplied resolver.
    function resolveWithResolver(
        address resolver,
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) external view returns (bytes memory) {
        ResolverInfo memory info;
        info.name = name;
        info.node = NameCoder.namehash(name, 0);
        info.resolver = resolver;
        _checkResolver(info);
        _callResolver(
            info,
            data,
            gateways,
            this.resolveCallback.selector, // ==> step 2
            abi.encode(resolver)
        );
    }

    /// @dev CCIP-Read callback for `resolveWithGateways()`.
    /// @param response The response from the resolver.
    /// @param extraData The contextual data passed from `resolveWith*()`.
    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (bytes memory, address) {
        return (response, abi.decode(extraData, (address)));
    }

    /// @notice Same as `reverseWithGateways()` but uses default batch gateways.
    function reverse(
        bytes calldata lookupAddress,
        uint256 coinType
    ) external view returns (string memory, address, address) {
        return
            reverseWithGateways(
                lookupAddress,
                coinType,
                batchGatewayProvider.gateways()
            );
    }

    struct ReverseArgs {
        bytes lookupAddress; // parsed input address
        uint256 coinType; // parsed coinType
        string[] gateways; // supplied gateways
        address resolver; // valid reverse resolver
    }

    /// @notice Performs ENS reverse resolution for the supplied address and coin type.
    ///         Caller should enable EIP-3668.
    /// @dev This function executes over multiple steps.
    /// @param lookupAddress The input address.
    /// @param coinType The coin type.
    /// @param gateways The list of batch gateway URLs to use.
    /// @return primary The resolved primary name.
    /// @return resolver The resolver address for primary name.
    /// @return reverseResolver The resolver address for the reverse name.
    function reverseWithGateways(
        bytes calldata lookupAddress,
        uint256 coinType,
        string[] memory gateways
    )
        public
        view
        returns (
            string memory primary,
            address resolver,
            address reverseResolver
        )
    {
        primary;
        resolver;
        reverseResolver;
        // https://docs.ens.domains/ensip/19
        ResolverInfo memory info = requireResolver(
            NameCoder.encode(ENSIP19.reverseName(lookupAddress, coinType)) // reverts EmptyAddress
        );
        _callResolver(
            info,
            abi.encodeCall(INameResolver.name, (info.node)),
            gateways,
            this.reverseNameCallback.selector, // ==> step 2
            abi.encode(
                ReverseArgs(lookupAddress, coinType, gateways, info.resolver)
            )
        );
    }

    /// @dev CCIP-Read callback for `reverseWithGateways()`.
    /// @param response The abi-encoded `name()` response from the reverse resolver.
    /// @param extraData The contextual data passed from `reverseWithGateways()`.
    function reverseNameCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (string memory primary, address, address) {
        ReverseArgs memory args = abi.decode(extraData, (ReverseArgs));
        primary = abi.decode(response, (string));
        if (bytes(primary).length == 0) {
            return ("", address(0), args.resolver);
        }
        ResolverInfo memory info = requireResolver(NameCoder.encode(primary));
        _callResolver(
            info,
            args.coinType == COIN_TYPE_ETH
                ? abi.encodeCall(IAddrResolver.addr, (info.node))
                : abi.encodeCall(
                    IAddressResolver.addr,
                    (info.node, args.coinType)
                ),
            args.gateways,
            this.reverseAddressCallback.selector, // ==> step 3
            abi.encode(args, primary, info.resolver)
        );
    }

    /// @dev CCIP-Read callback for `reverseNameCallback()`.
    ///      Reverts `ReverseAddressMismatch`.
    /// @param response The abi-encoded `addr()` response from the forward resolver.
    /// @param extraData The contextual data passed from `reverseNameCallback()`.
    function reverseAddressCallback(
        bytes calldata response,
        bytes calldata extraData
    )
        external
        pure
        returns (
            string memory primary,
            address resolver,
            address reverseResolver
        )
    {
        ReverseArgs memory args;
        (args, primary, resolver) = abi.decode(
            extraData,
            (ReverseArgs, string, address)
        );
        bytes memory primaryAddress;
        if (args.coinType == COIN_TYPE_ETH) {
            address addr = abi.decode(response, (address));
            primaryAddress = abi.encodePacked(addr);
        } else {
            primaryAddress = abi.decode(response, (bytes));
        }
        if (!BytesUtils.equals(args.lookupAddress, primaryAddress)) {
            revert ReverseAddressMismatch(primary, primaryAddress);
        }
        reverseResolver = args.resolver;
    }

    /// @dev Efficiently call a resolver.
    ///      If features are supported, and not a multicall or extended w/`RESOLVE_MULTICALL`, performs a direct call.
    ///      Otherwise, uses the batch gateway.
    /// @param info The resolver to call.
    /// @param call The calldata.
    /// @param gateways The list of batch gateway URLs to use.
    /// @param callbackFunction The function selector to call after resolution.
    /// @param extraData The contextual data passed to `callbackFunction`.
    function _callResolver(
        ResolverInfo memory info,
        bytes memory call,
        string[] memory gateways,
        bytes4 callbackFunction,
        bytes memory extraData
    ) internal view {
        if (
            ERC165Checker.supportsERC165InterfaceUnchecked(
                info.resolver,
                type(IFeatureSupporter).interfaceId
            ) &&
            (bytes4(call) != IMulticallable.multicall.selector ||
                (info.extended &&
                    IFeatureSupporter(info.resolver).supportsFeature(
                        ResolverFeatures.RESOLVE_MULTICALL
                    )))
        ) {
            ccipRead(
                address(info.resolver),
                info.extended
                    ? abi.encodeCall(
                        IExtendedResolver.resolve,
                        (info.name, call)
                    )
                    : call,
                this.resolveDirectCallback.selector,
                this.resolveDirectCallbackError.selector,
                abi.encode(
                    info.extended,
                    bytes4(call),
                    callbackFunction,
                    extraData
                )
            );
        } else {
            bytes[] memory calls;
            bool multi = bytes4(call) == IMulticallable.multicall.selector;
            if (multi) {
                calls = abi.decode(
                    BytesUtils.substring(call, 4, call.length - 4),
                    (bytes[])
                );
            } else {
                calls = new bytes[](1);
                calls[0] = call;
            }
            if (info.extended) {
                for (uint256 i; i < calls.length; ++i) {
                    calls[i] = abi.encodeCall(
                        IExtendedResolver.resolve,
                        (info.name, calls[i])
                    );
                }
            }
            ccipRead(
                address(this),
                abi.encodeCall(
                    this.ccipBatch,
                    (createBatch(info.resolver, calls, gateways))
                ),
                this.resolveBatchCallback.selector,
                IDENTITY_FUNCTION,
                abi.encode(info.extended, multi, callbackFunction, extraData)
            );
        }
    }

    /// @dev CCIP-Read callback for `_callResolver()` from calling the resolver successfully.
    function resolveDirectCallback(
        bytes memory response,
        bytes calldata extraData
    ) external view {
        (
            bool extended,
            bytes4 callSelector,
            bytes4 callbackFunction,
            bytes memory extraData_
        ) = abi.decode(extraData, (bool, bytes4, bytes4, bytes));
        if (response.length == 0) {
            revert UnsupportedResolverProfile(callSelector);
        }
        if (extended) {
            response = abi.decode(response, (bytes)); // unwrap resolve()
        }
        ccipRead(
            address(this),
            abi.encodeWithSelector(callbackFunction, response, extraData_)
        );
    }

    /// @dev CCIP-Read callback for `_callResolver()` from calling the resolver unsuccessfully.
    function resolveDirectCallbackError(
        bytes calldata response,
        bytes calldata
    ) external pure {
        _propagateResolverError(response);
    }

    /// @dev CCIP-Read callback for `_callResolver()` from calling the batch gateway successfully.
    function resolveBatchCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view {
        Lookup[] memory lookups = abi.decode(response, (Batch)).lookups;
        (
            bool extended,
            bool multi,
            bytes4 callbackFunction,
            bytes memory extraData_
        ) = abi.decode(extraData, (bool, bool, bytes4, bytes));
        bytes memory answer;
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
            answer = abi.encode(m);
        } else {
            Lookup memory lu = lookups[0];
            answer = lu.data;
            if ((lu.flags & FLAG_BATCH_ERROR) != 0) {
                assembly {
                    revert(add(answer, 32), mload(answer)) // propagate batch gateway errors
                }
            } else if ((lu.flags & FLAG_CALL_ERROR) != 0) {
                _propagateResolverError(answer);
            } else if (answer.length == 0) {
                revert UnsupportedResolverProfile(bytes4(lu.call));
            }
            if (extended) {
                answer = abi.decode(answer, (bytes)); // unwrap resolve()
            }
        }
        ccipRead(
            address(this),
            abi.encodeWithSelector(callbackFunction, answer, extraData_)
        );
    }

    /// @dev Propagate the revert from the resolver.
    /// @param v The error data.
    function _propagateResolverError(bytes memory v) internal pure {
        if (bytes4(v) == UnsupportedResolverProfile.selector) {
            assembly {
                revert(add(v, 32), mload(v))
            }
        } else {
            revert ResolverError(v);
        }
    }
}
