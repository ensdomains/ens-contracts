// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// https://github.com/ensdomains/ens-contracts/blob/feat/universalresolver-3/contracts/universalResolver/UniversalResolver.sol

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {CCIPReader, EIP3668} from "../ccipRead/CCIPReader.sol";
import {IForwardResolution, Lookup, Response, ResponseBits} from "./IForwardResolution.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IResolveMulticall} from "../resolvers/IResolveMulticall.sol";
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

    function findResolver(
        bytes calldata name
    )
        external
        view
        returns (address resolver, bytes32 namehash, uint256 finalOffset)
    {
        (Lookup memory lookup, ) = forwardResolution.resolve(
            name,
            new bytes[](0),
            new string[](0)
        );
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
            calls = abi.decode(EIP3668.drop(data, 4), (bytes[]));
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
                _revertError(answer);
            }
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
        bytes memory name = ENSIP19.dnsReverseName(encodedAddress, coinType);
        bytes32 node = BytesUtilsEncrypted.namehash(name, 0);
        calls[0] = abi.encodeCall(INameResolver.name, (node));
        bytes memory v = ccipRead(
            address(forwardResolution),
            abi.encodeCall(IForwardResolution.resolve, (name, calls, gateways)),
            this.reverseNameCallback.selector,
            abi.encode(ReverseCarry(encodedAddress, coinType, gateways))
        );
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    struct ReverseCarry {
        bytes encodedAddress;
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
            address reverseResolver
        )
    {
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        reverseResolver = _extractResolver(lookup); // reverts if the resolver isn't usable
        ReverseCarry memory state = abi.decode(carry, (ReverseCarry));
        if ((res[0].bits & ResponseBits.ERROR) != 0) {
            _revertError(res[0].data); // name() failed
        }
        bytes memory primary = abi.decode(res[0].data, (bytes));
        if (primary.length == 0) {
            return ("", address(0), reverseResolver); // name() was empty
        }
        bytes memory name = DNSCoder.encode(string(primary), true);
        bytes32 node = BytesUtilsEncrypted.namehash(name, 0);
        bytes[] memory calls = new bytes[](1);
        calls[0] = state.coinType == COIN_TYPE_ETH
            ? abi.encodeCall(IAddrResolver.addr, (node))
            : abi.encodeCall(IAddressResolver.addr, (node, state.coinType));
        bytes memory v = ccipRead(
            address(forwardResolution),
            abi.encodeCall(
                IForwardResolution.resolve,
                (name, calls, state.gateways)
            ),
            this.reverseAddressCallback.selector,
            abi.encode(state.encodedAddress, primary, reverseResolver)
        );
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
        bytes memory reverseAddress;
        (reverseAddress, primary, reverseResolver) = abi.decode(
            carry,
            (bytes, string, address)
        );
        (Lookup memory lookup, Response[] memory res) = abi.decode(
            ccip,
            (Lookup, Response[])
        );
        resolver = _extractResolver(lookup); // reverts if the resolver isn't usable
        bytes memory primaryAddress;
        Response memory r = res[0];
        if ((r.bits & ResponseBits.ERROR) == 0) {
            if (bytes4(r.call) == IAddrResolver.addr.selector) {
                address addr = abi.decode(r.data, (address));
                if (addr != address(0)) {
                    primaryAddress = abi.encodePacked(addr);
                }
            } else if (r.data.length > 0) {
                primaryAddress = abi.decode(r.data, (bytes));
            }
        }
        if (keccak256(reverseAddress) != keccak256(primaryAddress)) {
            revert ReverseAddressMismatch(primary, primaryAddress);
        }
    }

    function _extractResolver(
        Lookup memory lookup
    ) internal view returns (address resolver) {
        resolver = lookup.resolver;
        if (lookup.bits == 0) {
            if (resolver == address(0)) {
                revert ResolverNotFound(lookup.name);
            } else {
                revert ResolverNotContract(lookup.name, resolver);
            }
        }
    }

    function _revertError(bytes memory v) internal pure {
        if (bytes4(v) == HttpError.selector) {
            assembly {
                revert(add(v, 32), mload(v))
            }
        } else {
            revert ResolverError(v);
        }
    }
}
