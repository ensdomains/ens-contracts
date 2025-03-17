// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {CCIPReader, EIP3668} from "../ccipRead/CCIPReader.sol";
import {IForwardResolution, Lookup, LookupBits, Response, ResponseBits} from "./IForwardResolution.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IMulticallable} from "../resolvers/IMulticallable.sol";
import {IUniversalResolver} from "./IUniversalResolver.sol";
import {NameCoder} from "../utils/NameCoder.sol";
import {ENSIP19, COIN_TYPE_ETH} from "../utils/ENSIP19.sol";

/// @notice Universal Resolver compatible with ENS V1 and V2
contract UniversalResolver is IUniversalResolver, IERC165, CCIPReader, Ownable {
    IForwardResolution public forwardResolution;

    event ForwardResolutionChanged();

    constructor(IForwardResolution fwd) {
        forwardResolution = fwd;
    }

    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            type(IERC165).interfaceId == x ||
            type(IUniversalResolver).interfaceId == x;
    }

    function setForwardResolution(IForwardResolution fwd) external onlyOwner {
        forwardResolution = fwd;
        emit ForwardResolutionChanged();
    }

    function findResolver(
        bytes calldata name
    )
        external
        view
        returns (address resolver, bytes32 namehash, uint256 finalOffset)
    {
        Lookup memory lookup = forwardResolution.lookupName(name);
        resolver = lookup.resolver;
        namehash = lookup.node;
        finalOffset = lookup.offset;
    }

    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory, address) {
        return resolveWithGateways(name, data, new string[](0));
    }

    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory, address) {
        bytes[] memory calls;
        bool multi = bytes4(data) == IMulticallable.multicall.selector;
        if (multi) {
            calls = abi.decode(data[4:], (bytes[]));
        } else {
            calls = new bytes[](1);
            calls[0] = data;
        }
        bytes memory v = ccipRead(
            address(forwardResolution),
            abi.encodeCall(IForwardResolution.resolve, (name, calls, gateways)),
            this.resolveWithGatewaysCallback.selector,
            abi.encode(multi)
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function resolveWithGatewaysCallback(
        bytes calldata ccip,
        bytes calldata extraData
    ) external pure returns (bytes memory answer, address resolver) {
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        resolver = _requireResolver(lookup);
        bool multi = abi.decode(extraData, (bool));
        if (multi) {
            bytes[] memory m = new bytes[](res.length);
            for (uint256 i; i < res.length; i++) {
                m[i] = res[i].data;
            }
            answer = abi.encode(m);
        } else {
            answer = _requireResponse(res[0]);
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
        return reverseWithGateways(encodedAddress, coinType, new string[](0));
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
        bytes[] memory calls = new bytes[](1);
        bytes memory name = NameCoder.encode(
            ENSIP19.reverseName(encodedAddress, coinType)
        );
        bytes32 node = NameCoder.namehash(name, 0); // reverts if encodedAddress is empty
        calls[0] = abi.encodeCall(INameResolver.name, (node));
        bytes memory v = ccipRead(
            address(forwardResolution),
            abi.encodeCall(IForwardResolution.resolve, (name, calls, gateways)),
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
        bytes calldata ccip,
        bytes calldata extraData
    )
        external
        view
        returns (
            string memory /*primary*/,
            address /*resolver*/,
            address reverseResolver
        )
    {
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        reverseResolver = _requireResolver(lookup);
        bytes memory v = _requireResponse(res[0]);
        bytes memory primary = abi.decode(v, (bytes));
        if (primary.length == 0) {
            return ("", address(0), reverseResolver); // name() was empty
        }
        ReverseArgs memory args = abi.decode(extraData, (ReverseArgs));
        bytes memory name = NameCoder.encode(string(primary));
        bytes32 node = NameCoder.namehash(name, 0);
        bytes[] memory calls = new bytes[](1);
        calls[0] = args.coinType == COIN_TYPE_ETH
            ? abi.encodeCall(IAddrResolver.addr, (node))
            : abi.encodeCall(IAddressResolver.addr, (node, args.coinType));
        v = ccipRead(
            address(forwardResolution),
            abi.encodeCall(
                IForwardResolution.resolve,
                (name, calls, args.gateways)
            ),
            this.reverseAddressCallback.selector,
            abi.encode(args.encodedAddress, primary, reverseResolver)
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function reverseAddressCallback(
        bytes calldata ccip,
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
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        bytes memory reverseAddress;
        (reverseAddress, primary, reverseResolver) = abi.decode(
            extraData,
            (bytes, string, address)
        );
        resolver = _requireResolver(lookup);
        bytes memory v = _requireResponse(res[0]);
        bytes memory primaryAddress;
        if (bytes4(res[0].call) == IAddrResolver.addr.selector) {
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
    }

    function _requireResolver(
        Lookup memory lookup
    ) internal pure returns (address resolver) {
        resolver = lookup.resolver;
        if ((lookup.bits & LookupBits.OK) == 0) {
            if (resolver == address(0)) {
                revert ResolverNotFound(lookup.name);
            } else {
                revert ResolverNotContract(lookup.name, resolver);
            }
        }
    }

    function _requireResponse(
        Response memory res
    ) internal pure returns (bytes memory v) {
        v = res.data;
        if ((res.bits & ResponseBits.ERROR) != 0) {
            if (v.length == 0) {
                revert UnsupportedResolverProfile(bytes4(res.call));
            } else if (bytes4(v) == HttpError.selector) {
                assembly {
                    revert(add(v, 32), mload(v))
                }
            } else {
                revert ResolverError(v);
            }
        }
    }
}
