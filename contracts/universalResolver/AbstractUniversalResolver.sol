// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {IUniversalResolver} from "./IUniversalResolver.sol";
import {CCIPBatcher} from "../ccipRead/CCIPBatcher.sol";
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
    Ownable,
    ERC165
{
    string[] _gateways;

    constructor(string[] memory gateways) {
        _gateways = gateways;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165) returns (bool) {
        return
            type(IUniversalResolver).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @notice Set the default batch gateways, see: `resolve()` and `reverse()`.
    /// @param gateways The batch gateway URLs.
    function setBatchGateways(string[] memory gateways) external onlyOwner {
        _gateways = gateways;
    }

    /// @notice Get the default batch gateways.
    /// @return The batch gateway URLs.
    function batchGateways() external view returns (string[] memory) {
        return _gateways;
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
        return resolveWithGateways(name, data, _gateways);
    }

    /// @notice Performs ENS resolution process for the supplied name and resolution data.
    ///         Callers should enable EIP-3668.
    /// @dev This function executes over multiple steps (step 1 of 2).
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
        _callResolver(
            requireResolver(name),
            data,
            gateways,
            this.resolveCallback.selector,
            ""
        );
    }

    /// @notice Same as `resolveWithGateways()` but uses the supplied resolver.
    function resolveWithResolver(
        address resolver,
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) external view returns (bytes memory, address) {
        ResolverInfo memory info;
        info.name = name;
        info.node = NameCoder.namehash(name, 0);
        info.resolver = resolver;
        _checkResolver(info);
        _callResolver(info, data, gateways, this.resolveCallback.selector, "");
    }

    /// @dev CCIP-Read callback for `resolveWithGateways()` (step 2 of 2).
    /// @param info The resolver that was called.
    /// @param response The response from the resolver.
    function resolveCallback(
        ResolverInfo calldata info,
        bytes calldata response,
        bytes calldata
    ) external pure returns (bytes memory, address) {
        return (response, info.resolver);
    }

    /// @notice Same as `reverseWithGateways()` but uses default batch gateways.
    function reverse(
        bytes memory lookupAddress,
        uint256 coinType
    ) external view returns (string memory, address, address) {
        return reverseWithGateways(lookupAddress, coinType, _gateways);
    }

    struct ReverseArgs {
        bytes lookupAddress;
        uint256 coinType;
        string[] gateways;
    }

    /// @notice Performs ENS reverse resolution for the supplied address and coin type.
    ///         Callers should enable EIP-3668.
    /// @dev This function executes over multiple steps (step 1 of 3).
    /// @param lookupAddress The input address.
    /// @param coinType The coin type.
    /// @param gateways The list of batch gateway URLs to use.
    /// @return primary The resolved primary name.
    /// @return resolver The resolver address for primary name.
    /// @return reverseResolver The resolver address for the reverse name.
    function reverseWithGateways(
        bytes memory lookupAddress,
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
            this.reverseNameCallback.selector,
            abi.encode(ReverseArgs(lookupAddress, coinType, gateways))
        );
    }

    /// @dev CCIP-Read callback for `reverseWithGateways()` (step 2 of 3).
    /// @param infoRev The resolver for the reverse name that was called.
    /// @param response The abi-encoded `name()` response.
    /// @param extraData The contextual data passed from `reverseWithGateways()`.
    function reverseNameCallback(
        ResolverInfo calldata infoRev,
        bytes calldata response,
        bytes memory extraData // this cannot be calldata due to "stack too deep"
    ) external view returns (string memory primary, address, address) {
        ReverseArgs memory args = abi.decode(extraData, (ReverseArgs));
        primary = abi.decode(response, (string));
        if (bytes(primary).length == 0) {
            return ("", address(0), infoRev.resolver);
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
            this.reverseAddressCallback.selector,
            abi.encode(args, primary, infoRev.resolver)
        );
    }

    /// @dev CCIP-Read callback for `reverseNameCallback()` (step 3 of 3).
    ///      Reverts `ReverseAddressMismatch`.
    /// @param info The resolver for the primary name that was called.
    /// @param response The abi-encoded `addr()` response.
    /// @param extraData The contextual data passed from `reverseNameCallback()`.
    function reverseAddressCallback(
        ResolverInfo calldata info,
        bytes calldata response,
        bytes calldata extraData
    )
        external
        pure
        returns (string memory primary, address, address reverseResolver)
    {
        ReverseArgs memory args;
        (args, primary, reverseResolver) = abi.decode(
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
        return (primary, info.resolver, reverseResolver);
    }

    /// @dev Efficiently call a resolver.
    ///      If features are supported, and not a multicall or extended + multicall + `RESOLVE_MULTICALL`, performs a direct call.
    ///      Otherwise, uses the batch gateway.
    /// @param info The resolver to call.
    /// @param call The calldata.
    /// @param gateways The list of batch gateway URLs to use.
    /// @param callbackFunction The function selector to call after resolution.
    /// @param extraData The contextual data passed to `callbackFunction`.
    /// @dev The return type of this function is polymorphic depending on the caller.
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
                abi.encode(info, bytes4(call), callbackFunction, extraData),
                true
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
                for (uint256 i; i < calls.length; i++) {
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
                    (_createBatch(info.resolver, calls, gateways))
                ),
                this.resolveBatchCallback.selector,
                abi.encode(info, multi, callbackFunction, extraData),
                false
            );
        }
    }

    /// @dev CCIP-Read callback for `_callResolver()` from calling the resolver directly.
    function resolveDirectCallback(
        bytes memory response,
        bytes calldata extraData
    ) external view {
        (
            ResolverInfo memory info,
            bytes4 callSelector,
            bytes4 callbackFunction,
            bytes memory extraData_
        ) = abi.decode(extraData, (ResolverInfo, bytes4, bytes4, bytes));
        if (response.length == 0) {
            response = abi.encodeWithSelector(
                UnsupportedResolverProfile.selector,
                callSelector
            );
        }
        if ((response.length & 31) != 0) {
            revert ResolverError(response);
        }
        if (info.extended) {
            response = abi.decode(response, (bytes)); // unwrap resolve()
        }
        ccipRead(
            address(this),
            abi.encodeWithSelector(callbackFunction, info, response, extraData_)
        );
    }

    /// @dev CCIP-Read callback for `_callResolver()` from calling the batch gateway.
    function resolveBatchCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view {
        Lookup[] memory lookups = abi.decode(response, (Batch)).lookups;
        (
            ResolverInfo memory info,
            bool multi,
            bytes4 callbackFunction,
            bytes memory extraData_
        ) = abi.decode(extraData, (ResolverInfo, bool, bytes4, bytes));
        bytes[] memory m = new bytes[](lookups.length);
        for (uint256 i; i < lookups.length; i++) {
            Lookup memory lu = lookups[i];
            bytes memory v = lu.data;
            if ((lu.flags & FLAGS_ANY_ERROR) == 0 && info.extended) {
                v = abi.decode(v, (bytes)); // unwrap resolve()
            } else if ((lu.flags & FLAG_EMPTY_RESPONSE) != 0) {
                v = abi.encodeWithSelector(
                    UnsupportedResolverProfile.selector,
                    bytes4(v)
                );
            }
            m[i] = v;
        }
        bytes memory answer;
        if (multi) {
            answer = abi.encode(m);
        } else {
            answer = m[0];
            if (
                (lookups[0].flags & (FLAG_EMPTY_RESPONSE | FLAG_CALL_ERROR)) !=
                0 && // resolver-originating error should be wrapped
                bytes4(answer) != UnsupportedResolverProfile.selector // exception
            ) {
                revert ResolverError(answer);
            }
            if (answer.length & 31 != 0) {
                assembly {
                    revert(add(answer, 32), mload(answer))
                }
            }
        }
        ccipRead(
            address(this),
            abi.encodeWithSelector(callbackFunction, info, answer, extraData_)
        );
    }
}
