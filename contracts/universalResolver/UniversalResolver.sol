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

    /// @dev Update the default batch gateways
    function setBatchGateways(string[] memory gateways) external onlyOwner {
        batchGateways = gateways;
    }

    /// @dev Find the resolver address for `name`
    function findResolver(
        bytes memory name
    )
        external
        view
        returns (
            address /*resolver*/,
            bytes32 /*namehash*/,
            uint256 /*finalOffset*/
        )
    {
        return _findResolver(name, 0);
    }

    /// @dev Efficiently find the resolver address for `name[offset:]`
    function _findResolver(
        bytes memory name,
        uint256 offset
    ) internal view returns (address resolver, bytes32 node, uint256 offset_) {
        // https://docs.ens.domains/ensip/10
        bytes32 labelHash;
        (labelHash, offset_) = NameCoder.readLabel(name, offset);
        if (labelHash == bytes32(0)) {
            return (address(0), bytes32(0), 0);
        }
        (
            address parentResolver,
            bytes32 parentNode,
            uint256 parentOffset
        ) = _findResolver(name, offset_);
        node = keccak256(abi.encodePacked(parentNode, labelHash));
        resolver = registry.resolver(node);
        return
            resolver != address(0)
                ? (resolver, node, offset)
                : (parentResolver, node, parentOffset);
    }

    struct ResolverInfo {
        bytes name; // dns-encoded name (safe to decode)
        uint256 offset; // byte offset into name used for resolver
        bytes32 node; // namehash(name)
        address resolver;
        bool extended; // IExtendedResolver
    }

    /// @dev Returns a valid resolver for `name` or reverts
    ///      Reverts `ResolverNotFound` and `ResolverNotContract`
    function requireResolver(
        bytes memory name
    ) public view returns (ResolverInfo memory info) {
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

    /// @dev Same as `resolveWithGateways()` but uses default batch gateways
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory /*result*/, address /*resolver*/) {
        return resolveWithGateways(name, data, batchGateways);
    }

    /// @notice Performs ENS name resolution for the supplied name and resolution data.
    /// @notice Callers should enable EIP-3668.
    /// @dev (step 1 of 2)
    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory, address) {
        bool multi = bytes4(data) == IMulticallable.multicall.selector;
        bytes memory v = _resolve(
            requireResolver(name),
            multi ? abi.decode(data[4:], (bytes[])) : _oneCall(data),
            gateways,
            this.resolveCallback.selector,
            abi.encode(multi)
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    /// @dev CCIP-Read callback for `resolveWithGateways()` (step 1 of 2)
    function resolveCallback(
        ResolverInfo calldata info,
        Lookup[] calldata lookups,
        bytes calldata extraData
    ) external pure returns (bytes memory result, address resolver) {
        bool multi = abi.decode(extraData, (bool));
        if (multi) {
            bytes[] memory m = new bytes[](lookups.length);
            for (uint256 i; i < lookups.length; i++) {
                m[i] = lookups[i].data;
            }
            result = abi.encode(m);
        } else {
            result = _requireResponse(lookups[0]);
        }
        resolver = info.resolver;
    }

    /// @dev Same as `reverseWithGateways()` but uses default batch gateways
    function reverse(
        bytes memory encodedAddress,
        uint256 coinType
    )
        external
        view
        returns (
            string memory /*primary*/,
            address /*resolver*/,
            address /*reverseResolver*/
        )
    {
        return reverseWithGateways(encodedAddress, coinType, batchGateways);
    }

    struct ReverseArgs {
        bytes encodedAddress;
        uint256 coinType;
        string[] gateways;
    }

    /// @notice Performs ENS reverse resolution for the supplied address and coin type.
    /// @notice Callers should enable EIP-3668.
    /// @dev (step 1 of 3)
    function reverseWithGateways(
        bytes memory encodedAddress,
        uint256 coinType,
        string[] memory gateways
    )
        public
        view
        returns (
            string memory /*primary*/,
            address /*resolver*/,
            address /*reverseResolver*/
        )
    {
        // https://docs.ens.domains/ensip/19
        ResolverInfo memory info = requireResolver(
            NameCoder.encode(ENSIP19.reverseName(encodedAddress, coinType))
        );
        bytes memory v = _resolve(
            info,
            _oneCall(abi.encodeCall(INameResolver.name, (info.node))),
            gateways,
            this.reverseNameCallback.selector,
            abi.encode(ReverseArgs(encodedAddress, coinType, gateways))
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    /// @dev CCIP-Read callback for `reverseWithGateways()` (step 2 of 3)
    function reverseNameCallback(
        ResolverInfo calldata infoRev,
        Lookup[] calldata lookups,
        bytes memory v // variable is reused
    )
        external
        view
        returns (
            string memory primary,
            address /*resolver*/,
            address /*reverseResolver*/
        )
    {
        // this function is on the verge of "stack too deep"
        ReverseArgs memory args = abi.decode(v, (ReverseArgs));
        primary = abi.decode(_requireResponse(lookups[0]), (string));
        if (bytes(primary).length == 0) {
            return ("", address(0), infoRev.resolver);
        }
        ResolverInfo memory info = requireResolver(NameCoder.encode(primary));
        v = _resolve(
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
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    /// @dev CCIP-Read callback for `reverseNameCallback()` (step 3 of 3)
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
        bytes4 selector = bytes4(lookups[0].call);
        bytes memory primaryAddress;
        if (selector == IAddrResolver.addr.selector) {
            address addr = abi.decode(v, (address));
            if (addr != address(0)) {
                primaryAddress = abi.encodePacked(addr);
            }
        } else if (selector == IAddressResolver.addr.selector) {
            primaryAddress = abi.decode(v, (bytes));
        }
        if (!BytesUtils.equals(reverseAddress, primaryAddress)) {
            revert ReverseAddressMismatch(primary, primaryAddress);
        }
        resolver = info.resolver;
    }

    /// @dev Perform multiple resolver calls in parallel using batch gateway
    function _resolve(
        ResolverInfo memory info,
        bytes[] memory calls,
        string[] memory gateways,
        bytes4 callbackFunction,
        bytes memory extraData
    ) internal view returns (bytes memory) {
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
        return
            ccipRead(
                address(this),
                abi.encodeCall(this.ccipBatch, (batch)),
                this.resolveBatchCallback.selector,
                abi.encode(info, callbackFunction, extraData)
            );
    }

    /// @dev CCIP-Read callback for `_resolve()`
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
        bytes memory v = ccipRead(
            address(this),
            abi.encodeWithSelector(
                callbackFunction_,
                info,
                batch.lookups,
                extraData_
            )
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    /// @dev Extract `data` from `resolve(bytes, bytes data)` calldata
    function _unwrapResolve(
        bytes memory v
    ) internal pure returns (bytes memory ret) {
        // resolve(bytes name, bytes data):      | <== offset starts here
        // => uint256(length) + bytes4(selector) | offset(name) + offset(data)
        //           32       +        4         |      32
        assembly {
            ret := add(v, 36) // start
            ret := add(ret, mload(add(ret, 32))) // += offset(data)
        }
    }

    /// @dev Extract `data` from a lookup or revert an appropriate error
    function _requireResponse(
        Lookup memory lu
    ) internal pure returns (bytes memory v) {
        v = lu.data;
        if ((lu.flags & FLAG_OFFCHAIN_ERROR) != 0) {
            assembly {
                revert(add(v, 32), mload(v)) // HttpError or Error
            }
        } else if ((lu.flags & FLAG_CALL_ERROR) != 0) {
            revert ResolverError(v); // any error from Resolver
        } else if ((lu.flags & FLAG_EMPTY_RESPONSE) != 0) {
            revert UnsupportedResolverProfile(bytes4(v)); // initial call or callback was unimplemented
        }
    }

    /// @dev Create an array with one `call`
    function _oneCall(
        bytes memory call
    ) internal pure returns (bytes[] memory calls) {
        calls = new bytes[](1);
        calls[0] = call;
    }
}
