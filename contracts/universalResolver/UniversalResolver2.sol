// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// https://github.com/ensdomains/ens-contracts/blob/feat/universalresolver-3/contracts/universalResolver/UniversalResolver.sol

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {CCIPReader} from "../ccipRead/CCIPReader.sol";
import {IForwardResolution, Lookup, Response, ResponseBits} from "./IForwardResolution.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IResolveMulticall} from "../utils/IResolveMulticall.sol";
import {IUniversalResolver} from "./IUniversalResolver.sol";
import {DNSCoder} from "../utils/DNSCoder.sol";
import {ENSIP19, EVM_BIT, COIN_TYPE_ETH} from "../utils/ENSIP19.sol";
import {BytesUtilsEncrypted} from "../utils/BytesUtilsEncrypted.sol";
import {HexUtils} from "../utils/HexUtils.sol";

contract UniversalResolver2 is
    IUniversalResolver,
    IERC165,
    CCIPReader,
    Ownable
{
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

    function registry() external view returns (address) {
        return forwardResolution.registry();
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
        bytes memory data
    ) external view returns (bytes memory, address) {
        return resolveWithGateways(name, data, new string[](0));
    }

    function resolveWithGateways(
        bytes memory name,
        bytes memory data,
        string[] memory gateways
    ) public view returns (bytes memory, address) {
        bytes[] memory calls;
        bool multi = bytes4(data) == IResolveMulticall.multicall.selector;
        if (multi) {
            assembly {
                mstore(add(data, 4), sub(mload(data), 4)) // drop selector
                data := add(data, 4)
            }
            calls = abi.decode(data, (bytes[]));
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
        bytes memory ccip,
        bytes memory carry
    ) external view returns (bytes memory answer, address resolver) {
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        resolver = _extractResolver(lookup);
        bool multi = abi.decode(carry, (bool));
        if (multi) {
            bytes[] memory m = new bytes[](res.length);
            for (uint256 i; i < res.length; i++) {
                m[i] = res[i].data;
            }
            answer = abi.encode(m);
        } else {
            answer = res[0].data;
            if ((res[0].bits & ResponseBits.ERROR) != 0) {
                revert ResolverError(answer);
            }
        }
    }

    // function reverse(
    //     address addr,
    //     uint32 chain
    // )
    //     external
    //     view
    //     returns (
    //         string memory /*primary*/,
    //         address /*resolver*/,
    //         address /*reverseResolver*/
    //     )
    // {
    //     return
    //         reverseWithGateways(
    //             abi.encodePacked(addr),
    //             chain | EVM_BIT,
    //             new string[](0)
    //         );
    // }

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
        bytes memory v = _reverseWithFallback(
            encodedAddress,
            coinType,
            coinType,
            gateways
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function _reverseWithFallback(
        bytes memory encodedAddress,
        uint256 coinType,
        uint256 inputCoinType,
        string[] memory gateways
    ) internal view returns (bytes memory) {
        bytes[] memory calls = new bytes[](1);
        bytes memory name = ENSIP19.dnsReverseName(encodedAddress, coinType);
        bytes32 node = BytesUtilsEncrypted.namehash(name, 0);
        calls[0] = abi.encodeCall(INameResolver.name, (node));
        return
            ccipRead(
                address(forwardResolution),
                abi.encodeCall(
                    IForwardResolution.resolve,
                    (name, calls, gateways)
                ),
                this.reverseNameCallback.selector,
                abi.encode(
                    ReverseCarry(
                        encodedAddress,
                        inputCoinType,
                        coinType,
                        gateways
                    )
                )
            );
    }

    struct ReverseCarry {
        bytes encodedAddress;
        uint256 inputCoinType;
        uint256 coinType;
        string[] gateways;
    }

    function reverseNameCallback(
        bytes memory ccip,
        bytes memory carry
    )
        external
        view
        returns (
            string memory /*primary*/,
            address /*resolver*/,
            address /*reverseResolver*/
        )
    {
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        ReverseCarry memory state = abi.decode(carry, (ReverseCarry));
        bytes memory primary;
        if (
            lookup.resolver != address(0) &&
            (res[0].bits & ResponseBits.ERROR) == 0
        ) {
            primary = abi.decode(res[0].data, (bytes));
        }
        bool useFallback = ENSIP19.chainFromCoinType(state.inputCoinType) != 0;
        bytes memory v;
        if (primary.length == 0) {
            if (useFallback) {
                v = _reverseWithFallback(
                    state.encodedAddress,
                    EVM_BIT,
                    state.inputCoinType, // remember the original coinType
                    state.gateways
                );
            } else {
                // NOTE: we could throw ResolverError()
                // there might be 2 errors (for both attempts)
                return ("", address(0), _extractResolver(lookup));
            }
        } else {
            bytes memory name = DNSCoder.encode(string(primary), true);
            bytes32 node = BytesUtilsEncrypted.namehash(name, 0);
            bytes[] memory calls = new bytes[](useFallback ? 2 : 1);
            calls[0] = state.inputCoinType == COIN_TYPE_ETH
                ? abi.encodeCall(IAddrResolver.addr, (node))
                : abi.encodeCall(
                    IAddressResolver.addr,
                    (node, state.inputCoinType)
                );
            if (useFallback) {
                calls[1] = abi.encodeCall(
                    IAddressResolver.addr,
                    (node, EVM_BIT)
                );
            }
            v = ccipRead(
                address(forwardResolution),
                abi.encodeCall(
                    IForwardResolution.resolve,
                    (name, calls, state.gateways)
                ),
                this.reverseAddressCallback.selector,
                abi.encode(state.encodedAddress, primary, lookup.resolver)
            );
        }
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function reverseAddressCallback(
        bytes memory ccip,
        bytes memory carry
    )
        external
        view
        returns (
            string memory primary,
            address resolver,
            address reverseResolver
        )
    {
        bytes memory encodedAddress;
        (encodedAddress, primary, reverseResolver) = abi.decode(
            carry,
            (bytes, string, address)
        );
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        resolver = _extractResolver(lookup);
        bytes memory checkedAddress;
        for (uint256 i; i < res.length && checkedAddress.length == 0; i++) {
            Response memory r = res[i];
            if ((r.bits & ResponseBits.ERROR) == 0) {
                if (bytes4(r.call) == IAddrResolver.addr.selector) {
                    uint160 a = uint160(uint256(bytes32(r.data)));
                    if (a > 0) {
                        checkedAddress = abi.encodePacked(a);
                    }
                } else if (r.data.length > 0) {
                    checkedAddress = abi.decode(r.data, (bytes));
                }
            }
        }
        if (keccak256(encodedAddress) != keccak256(checkedAddress)) {
            revert ReverseAddressMismatch(encodedAddress, checkedAddress);
        }
    }

    function _extractResolver(
        Lookup memory lookup
    ) internal view returns (address resolver) {
        resolver = lookup.resolver;
        if (resolver == address(0)) {
            revert ResolverNotFound(lookup.dns);
        }
        if (resolver.code.length == 0) {
            revert ResolverNotContract(lookup.dns);
        }
    }
}
