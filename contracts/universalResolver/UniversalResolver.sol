// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {IUniversalResolver} from "./IUniversalResolver.sol";
import {CCIPBatcher} from "../ccipRead/CCIPBatcher.sol";
import {ENS} from "../registry/ENS.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IMulticallable} from "../resolvers/IMulticallable.sol";
import {NameCoder} from "../utils/NameCoder.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";
import {ENSIP19, COIN_TYPE_ETH} from "../utils/ENSIP19.sol";

contract UniversalResolver is IUniversalResolver, CCIPBatcher, Ownable, ERC165 {
    ENS public immutable registry;
    string[] public batchGateways;

    constructor(ENS ens, string[] memory gateways) {
        registry = ens;
        batchGateways = gateways;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(ERC165) returns (bool) {
        return
            super.supportsInterface(interfaceID) &&
            type(IUniversalResolver).interfaceId == interfaceID;
    }

    /// @dev Set the default batch gateways, see: `resolve()` and `reverse()`.
    /// @param gateways The list of batch gateway URLs to use as default.
    function setBatchGateways(string[] memory gateways) external onlyOwner {
        batchGateways = gateways;
    }

    /// @dev Find the resolver address for `name`.
    ///      Does not perform any validity checks.
    /// @param name The name to search.
    function findResolver(
        bytes memory name
    ) external view returns (address, bytes32, uint256) {
        return _findResolver(name, 0);
    }

    /// @dev Efficiently find the resolver address for `name[offset:]`.
    /// @param name The name to search.
    /// @param offset The byte-offset into `name` to begin the search.
    /// @return resolver The address of the resolver.
    /// @return node The namehash of name corresponding to the resolver.
    /// @return offset_ The byte-offset into `name` of the name corresponding to the resolver.
    function _findResolver(
        bytes memory name,
        uint256 offset
    ) internal view returns (address resolver, bytes32 node, uint256 offset_) {
        (bytes32 labelHash, uint256 next) = NameCoder.readLabel(name, offset);
        if (labelHash != bytes32(0)) {
            (
                address parentResolver,
                bytes32 parentNode,
                uint256 parentOffset
            ) = _findResolver(name, next);
            node = keccak256(abi.encodePacked(parentNode, labelHash));
            resolver = registry.resolver(node);
            return
                resolver != address(0)
                    ? (resolver, node, offset)
                    : (parentResolver, node, parentOffset);
        }
    }

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
        info.name = name;
        (info.resolver, info.node, info.offset) = _findResolver(name, 0);
        if (info.resolver == address(0)) {
            revert ResolverNotFound(name);
        } else if (
            ERC165Checker.supportsERC165InterfaceUnchecked(
                info.resolver,
                type(IExtendedResolver).interfaceId
            )
        ) {
            info.extended = true;
        } else if (info.offset != 0) {
            revert ResolverNotFound(name); // immediate resolver requires exact match
        } else if (info.resolver.code.length == 0) {
            revert ResolverNotContract(name, info.resolver);
        }
    }

    /// @notice Same as `resolveWithGateways()` but uses default batch gateways.
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory /*result*/, address /*resolver*/) {
        return resolveWithGateways(name, data, batchGateways);
    }

    /// @notice Performs ENS name resolution for the supplied name and resolution data.
    /// @notice Callers should enable EIP-3668.
    /// @dev This function executes over multiple steps (step 1 of 2).
    /// @return result The encoded response for the requested call.
    /// @return resolver The address of the resolver that supplied `result`.
    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory /*result*/, address /*resolver*/) {
        bool multi = bytes4(data) == IMulticallable.multicall.selector;
        _resolveBatch(
            requireResolver(name),
            multi ? abi.decode(data[4:], (bytes[])) : _oneCall(data),
            gateways,
            this.resolveCallback.selector,
            abi.encode(multi)
        );
    }

    /// @dev CCIP-Read callback for `resolveWithGateways()` (step 2 of 2).
    /// @param info The resolver that was called.
    /// @param lookups The lookups corresponding to the requested call.
    /// @param extraData The contextual data passed from `resolveWithGateways()`.
    /// @return result The encoded response for the requested call.
    /// @return resolver The address of the resolver that supplied `result`.
    function resolveCallback(
        ResolverInfo calldata info,
        Lookup[] calldata lookups,
        bytes calldata extraData
    ) external pure returns (bytes memory result, address resolver) {
        bool multi = abi.decode(extraData, (bool));
        if (multi) {
            bytes[] memory m = new bytes[](lookups.length);
            for (uint256 i; i < lookups.length; i++) {
                Lookup memory lu = lookups[i];
                if ((lu.flags & FLAG_EMPTY_RESPONSE) == 0) {
                    m[i] = lookups[i].data;
                }
            }
            result = abi.encode(m);
        } else {
            result = _requireResponse(lookups[0]);
        }
        resolver = info.resolver;
    }

    /// @notice Same as `reverseWithGateways()` but uses default batch gateways.
    function reverse(
        bytes memory encodedAddress,
        uint256 coinType
    ) external view returns (string memory, address /* resolver */, address) {
        return reverseWithGateways(encodedAddress, coinType, batchGateways);
    }

    struct ReverseArgs {
        bytes encodedAddress;
        uint256 coinType;
        string[] gateways;
    }

    /// @notice Performs ENS reverse resolution for the supplied address and coin type.
    /// @notice Callers should enable EIP-3668.
    /// @dev This function executes over multiple steps (step 1 of 3).
    /// @param encodedAddress The input address.
    /// @param coinType The coin type.
    /// @param gateways The list of batch gateway URLs to use.
    function reverseWithGateways(
        bytes memory encodedAddress,
        uint256 coinType,
        string[] memory gateways
    ) public view returns (string memory, address /* resolver */, address) {
        // https://docs.ens.domains/ensip/19
        ResolverInfo memory info = requireResolver(
            NameCoder.encode(ENSIP19.reverseName(encodedAddress, coinType)) // reverts EmptyAddress
        );
        _resolveBatch(
            info,
            _oneCall(abi.encodeCall(INameResolver.name, (info.node))),
            gateways,
            this.reverseNameCallback.selector,
            abi.encode(ReverseArgs(encodedAddress, coinType, gateways))
        );
    }

    /// @dev CCIP-Read callback for `reverseWithGateways()` (step 2 of 3).
    /// @param infoRev The resolver for the reverse name that was called.
    /// @param lookups The lookups corresponding to the calls: `[name()]`.
    /// @param extraData The contextual data passed from `reverseWithGateways()`.
    function reverseNameCallback(
        ResolverInfo calldata infoRev,
        Lookup[] calldata lookups,
        bytes memory extraData // this cannot be calldata due to "stack too deep"
    ) external view returns (string memory primary, address, address) {
        ReverseArgs memory args = abi.decode(extraData, (ReverseArgs));
        primary = abi.decode(_requireResponse(lookups[0]), (string));
        if (bytes(primary).length == 0) {
            return ("", address(0), infoRev.resolver);
        }
        ResolverInfo memory info = requireResolver(NameCoder.encode(primary));
        _resolveBatch(
            info,
            _oneCall(
                args.coinType == COIN_TYPE_ETH
                    ? abi.encodeCall(IAddrResolver.addr, (info.node))
                    : abi.encodeCall(
                        IAddressResolver.addr,
                        (info.node, args.coinType)
                    )
            ),
            args.gateways,
            this.reverseAddressCallback.selector,
            abi.encode(args.encodedAddress, primary, infoRev.resolver)
        );
    }

    /// @dev CCIP-Read callback for `reverseNameCallback()` (step 3 of 3).
    ///      Reverts `ReverseAddressMismatch`.
    /// @param info The resolver for the primary name that was called.
    /// @param lookups The lookups corresponding to the calls: `[addr()]`.
    /// @param extraData The contextual data passed from `reverseNameCallback()`.
    /// @return primary The resolved primary name.
    /// @return resolver The resolver address for primary name.
    /// @return reverseResolver The resolver address for the reverse name.
    function reverseAddressCallback(
        ResolverInfo calldata info,
        Lookup[] calldata lookups,
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
        bytes memory reverseAddress;
        (reverseAddress, primary, reverseResolver) = abi.decode(
            extraData,
            (bytes, string, address)
        );
        bytes memory v = _requireResponse(lookups[0]);
        bytes memory primaryAddress;
        bytes4 selector = bytes4(lookups[0].call);
        if (selector == IAddrResolver.addr.selector) {
            address addr = abi.decode(v, (address));
            primaryAddress = abi.encodePacked(addr);
        } else if (selector == IAddressResolver.addr.selector) {
            primaryAddress = abi.decode(v, (bytes));
        }
        if (!BytesUtils.equals(reverseAddress, primaryAddress)) {
            revert ReverseAddressMismatch(primary, primaryAddress);
        }
        resolver = info.resolver;
    }

    /// @dev Perform multiple resolver calls in parallel using batch gateway.
    /// @param info The resolver to call.
    /// @param calls The list of resolver calldata, eg. `[addr(), text()]`.
    /// @param gateways The list of batch gateway URLs to use.
    /// @param callbackFunction The function selector to call after resolution.
    /// @param extraData The contextual data passed to `callbackFunction`.
    /// @dev The return type of this function is polymorphic depending on the caller.
    function _resolveBatch(
        ResolverInfo memory info,
        bytes[] memory calls,
        string[] memory gateways,
        bytes4 callbackFunction,
        bytes memory extraData
    ) internal view {
        Batch memory batch = Batch(new Lookup[](calls.length), gateways);
        for (uint256 i; i < calls.length; i++) {
            Lookup memory lu = batch.lookups[i];
            lu.target = info.resolver;
            lu.call = info.extended
                ? abi.encodeCall(
                    IExtendedResolver.resolve,
                    (info.name, calls[i])
                )
                : calls[i];
        }
        ccipRead(
            address(this),
            abi.encodeCall(this.ccipBatch, (batch)),
            this.resolveBatchCallback.selector,
            abi.encode(info, callbackFunction, extraData)
        );
    }

    /// @dev CCIP-Read callback for `_resolveBatch()`.
    /// @param response The response data from `CCIPBatcher`.
    /// @param extraData The contextual data from `_resolveBatch()`.
    function resolveBatchCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view {
        Batch memory batch = abi.decode(response, (Batch));
        (
            ResolverInfo memory info,
            bytes4 callbackFunction_,
            bytes memory extraData_
        ) = abi.decode(extraData, (ResolverInfo, bytes4, bytes));
        if (info.extended) {
            for (uint256 i; i < batch.lookups.length; i++) {
                Lookup memory lu = batch.lookups[i];
                lu.call = _unwrapResolve(lu.call);
                if ((lu.flags & FLAGS_ANY_ERROR) == 0) {
                    lu.data = abi.decode(lu.data, (bytes));
                }
            }
        }
        ccipRead(
            address(this),
            abi.encodeWithSelector(
                callbackFunction_,
                info,
                batch.lookups,
                extraData_
            )
        );
    }

    /// @dev Extract `data` from `resolve(bytes, bytes data)` calldata.
    /// @param v The `resolve(bytes, bytes data)` calldata.
    /// @return data The inner `bytes data` argument.
    function _unwrapResolve(
        bytes memory v
    ) internal pure returns (bytes memory data) {
        // resolve(bytes name, bytes data):      | <== offset starts here
        // => uint256(length) + bytes4(selector) | offset(name) + offset(data)
        //           32       +        4         |      32
        assembly {
            data := add(v, 36) // location of offset start
            data := add(data, mload(add(data, 32))) // += offset(data)
        }
    }

    /// @dev Extract `data` from a lookup or revert an appropriate error.
    ///      Reverts if the `data` is not a successful response.
    /// @param lu The lookup to extract from.
    /// @return v The successful response (always 32+ bytes).
    function _requireResponse(
        Lookup memory lu
    ) internal pure returns (bytes memory v) {
        v = lu.data;
        if ((lu.flags & FLAG_BATCH_ERROR) != 0) {
            assembly {
                revert(add(v, 32), mload(v)) // HttpError or Error
            }
        } else if ((lu.flags & FLAG_CALL_ERROR) != 0) {
            if (bytes4(v) == UnsupportedResolverProfile.selector) {
                assembly {
                    revert(add(v, 32), mload(v))
                }
            }
            revert ResolverError(v); // any error from Resolver
        } else if ((lu.flags & FLAG_EMPTY_RESPONSE) != 0) {
            revert UnsupportedResolverProfile(bytes4(v)); // initial call or callback was unimplemented
        }
    }

    /// @dev Create an array with one `call`.
    /// @param call The single calldata.
    /// @return calls The one-element calldata array, eg. `[call]`.
    function _oneCall(
        bytes memory call
    ) internal pure returns (bytes[] memory calls) {
        calls = new bytes[](1);
        calls[0] = call;
    }
}
