// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165, ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {ENS} from "../registry/ENS.sol";
import {IUniversalResolver} from "./IUniversalResolver.sol";
import {IBatchcall, Thread, ThreadBits} from "../batchGateway/IBatchcall.sol";
import {CCIPReader} from "../ccipRead/CCIPReader.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IMulticallable} from "../resolvers/IMulticallable.sol";
import {NameCoder} from "../utils/NameCoder.sol";
import {ENSIP19, COIN_TYPE_ETH} from "../utils/ENSIP19.sol";

contract UniversalResolver is IUniversalResolver, IERC165, CCIPReader, Ownable {
    ENS public immutable registry;
    IBatchcall public immutable batchcall;
    string[] public batchGateways;

    constructor(ENS ens, IBatchcall _batchcall, string[] memory gateways) {
        batchcall = _batchcall;
        registry = ens;
        batchGateways = gateways;
    }

    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            type(IERC165).interfaceId == x ||
            type(IUniversalResolver).interfaceId == x;
    }

    function setBatchGateways(string[] memory gateways) external onlyOwner {
        batchGateways = gateways;
    }

    function findResolver(
        bytes calldata name
    )
        external
        view
        returns (address resolver, bytes32 namehash, uint256 finalOffset)
    {
        Lookup memory lookup = lookupResolver(name);
        resolver = lookup.resolver;
        namehash = lookup.node;
        finalOffset = lookup.offset;
    }

    struct Lookup {
        bytes name; // dns-encoded name (safe to decode)
        uint256 offset; // byte offset into name for basename
        bytes32 node; // namehash(name)
        address resolver; // resolver(basenode), null if invalid
        bool extended; // IExtendedResolver
    }

    function lookupResolver(
        bytes memory name
    ) public view returns (Lookup memory lookup) {
        // https://docs.ens.domains/ensip/10
        uint256 offset;
        address resolver;
        bytes32 node = NameCoder.namehash(name, 0);
        lookup.name = name;
        lookup.node = node;
        while (true) {
            resolver = registry.resolver(node);
            if (resolver != address(0)) break; // found a resolver
            uint256 size = uint8(name[offset]);
            if (size == 0) revert ResolverNotFound(name); // no match
            offset += 1 + size;
            node = NameCoder.namehash(name, offset);
        }
        if (
            ERC165Checker.supportsERC165InterfaceUnchecked(
                resolver,
                type(IExtendedResolver).interfaceId
            )
        ) {
            lookup.extended = true;
        } else if (offset != 0) {
            revert ResolverNotFound(name); // non-extended resolver requires exact match
        } else if (resolver.code.length == 0) {
            revert ResolverNotContract(name, resolver);
        }
        lookup.resolver = resolver;
        lookup.offset = offset; // offset into name
    }

    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory /*result*/, address /*resolver*/) {
        return resolveWithGateways(name, data, batchGateways);
    }

    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory, address) {
        bool multi = bytes4(data) == IMulticallable.multicall.selector;
        bytes memory v = _resolveBatch(
            lookupResolver(name),
            multi ? abi.decode(data[4:], (bytes[])) : _oneCall(data),
            gateways,
            this.resolveWithGatewaysCallback.selector,
            abi.encode(multi)
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function resolveWithGatewaysCallback(
        Lookup calldata lookup,
        Thread[] calldata threads,
        bytes calldata myData
    ) external pure returns (bytes memory result, address resolver) {
        bool multi = abi.decode(myData, (bool));
        resolver = lookup.resolver;
        if (multi) {
            bytes[] memory m = new bytes[](threads.length);
            for (uint256 i; i < threads.length; i++) {
                m[i] = threads[i].data;
            }
            result = abi.encode(m);
        } else {
            result = _requireResponse(threads[0]);
        }
    }

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
        Lookup memory lookup = lookupResolver(
            NameCoder.encode(ENSIP19.reverseName(encodedAddress, coinType))
        );
        bytes memory v = _resolveBatch(
            lookup,
            _oneCall(abi.encodeCall(INameResolver.name, (lookup.node))),
            gateways,
            this.reverseNameCallback.selector,
            abi.encode(ReverseArgs(encodedAddress, coinType, gateways))
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    struct ReverseArgs {
        bytes encodedAddress;
        uint256 coinType;
        string[] gateways;
    }

    function reverseNameCallback(
        Lookup calldata revLookup,
        Thread[] calldata threads,
        bytes memory v // stack too deep
    )
        external
        view
        returns (
            string memory primary,
            address /*resolver*/,
            address /*reverseResolver*/
        )
    {
        ReverseArgs memory args = abi.decode(v, (ReverseArgs));
        v = _requireResponse(threads[0]);
        primary = abi.decode(v, (string));
        if (bytes(primary).length == 0) {
            return ("", address(0), revLookup.resolver); // name() was empty
        }
        Lookup memory lookup = lookupResolver(NameCoder.encode(primary));
        v = _resolveBatch(
            lookup,
            _oneCall(
                args.coinType == COIN_TYPE_ETH
                    ? abi.encodeCall(IAddrResolver.addr, (lookup.node))
                    : abi.encodeCall(
                        IAddressResolver.addr,
                        (lookup.node, args.coinType)
                    )
            ),
            args.gateways,
            this.reverseAddressCallback.selector,
            abi.encode(args.encodedAddress, primary, revLookup.resolver)
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function reverseAddressCallback(
        Lookup calldata lookup,
        Thread[] calldata threads,
        bytes calldata myData
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
            myData,
            (bytes, string, address)
        );
        bytes memory v = _requireResponse(threads[0]);
        bytes memory primaryAddress;
        if (bytes4(threads[0].call) == IAddrResolver.addr.selector) {
            address addr = abi.decode(v, (address));
            if (addr != address(0)) {
                primaryAddress = abi.encodePacked(addr);
            }
        } else {
            primaryAddress = abi.decode(v, (bytes));
        }
        if (keccak256(reverseAddress) != keccak256(primaryAddress)) {
            revert ReverseAddressMismatch(primary, primaryAddress);
        }
        resolver = lookup.resolver;
    }

    function _resolveBatch(
        Lookup memory lookup,
        bytes[] memory calls,
        string[] memory gateways,
        bytes4 callback,
        bytes memory extraData
    ) internal view returns (bytes memory) {
        Thread[] memory threads = new Thread[](calls.length);
        for (uint256 i; i < calls.length; i++) {
            Thread memory t = threads[i];
            t.target = lookup.resolver;
            t.call = lookup.extended
                ? abi.encodeCall(
                    IExtendedResolver.resolve,
                    (lookup.name, calls[i])
                )
                : calls[i];
        }
        return
            ccipRead(
                address(batchcall),
                abi.encodeCall(IBatchcall.batch, (threads, gateways)),
                this.resolveBatchCallback.selector,
                abi.encode(lookup, callback, extraData)
            );
    }

    function resolveBatchCallback(
        bytes calldata ccip,
        bytes calldata extraData
    ) external view {
        Thread[] memory threads = abi.decode(ccip, (Thread[]));
        (Lookup memory lookup, bytes4 callback, bytes memory carry) = abi
            .decode(extraData, (Lookup, bytes4, bytes));
        if (lookup.extended) {
            for (uint256 i; i < threads.length; i++) {
                Thread memory t = threads[i];
                t.call = _unwrapResolve(t.call);
                if ((t.bits & ThreadBits.ERROR_MASK) == 0) {
                    t.data = abi.decode(t.data, (bytes));
                }
            }
        }
        (bool ok, bytes memory v) = address(this).staticcall(
            abi.encodeWithSelector(callback, lookup, threads, carry)
        );
        if (ok) {
            assembly {
                return(add(v, 32), mload(v))
            }
        } else {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
    }

    function _unwrapResolve(
        bytes memory v
    ) internal pure returns (bytes memory ret) {
        // resolve(bytes name, bytes data):      | <== offset starts here
        // => uint256(length) + bytes4(selector) | offset(name) + offset(data)
        //           32       +        4         |      32
        assembly {
            ret := add(v, 36) // start + 32 + 4
            ret := add(ret, mload(add(ret, 32))) // that + offset(data)
        }
    }

    function _requireResponse(
        Thread memory thread
    ) internal pure returns (bytes memory v) {
        v = thread.data;
        if ((thread.bits & ThreadBits.OFFCHAIN_ERROR) != 0) {
            assembly {
                revert(add(v, 32), mload(v)) // HttpError or Error
            }
        } else if ((thread.bits & ThreadBits.CALL_ERROR) != 0) {
            revert ResolverError(v); // any error from Resolver
        } else if ((thread.bits & ThreadBits.EMPTY_RESPONSE) != 0) {
            revert UnsupportedResolverProfile(bytes4(v));
        }
    }

    function _oneCall(
        bytes memory call
    ) internal pure returns (bytes[] memory calls) {
        calls = new bytes[](1);
        calls[0] = call;
    }
}
