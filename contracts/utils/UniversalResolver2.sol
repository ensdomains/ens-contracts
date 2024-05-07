// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ENS} from "../registry/ENS.sol";
import {ERC3668Multicallable, MulticallableGateway} from "./ERC3668Multicallable.sol";
import {ERC3668Caller} from "./ERC3668Caller.sol";
import {ENSIP10ResolverFinder} from "./ENSIP10ResolverFinder.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {ERC3668Utils, OffchainLookupData} from "../utils/ERC3668Utils.sol";
import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";
import {Resolver, INameResolver, IAddrResolver, IAddressResolver} from "../resolvers/Resolver.sol";
import {AddrResolver} from "../resolvers/profiles/AddrResolver.sol";
import {IMulticallable, IMulticallableSimple} from "../resolvers/IMulticallable.sol";
import {HexUtils} from "./HexUtils.sol";
import {BytesUtils} from "../wrapper/BytesUtils.sol";
import {NameEncoder} from "./NameEncoder.sol";

error ResolverNotFound();

error ReverseNodeNotFound();

error ReverseAddressMismatch(bytes result);

error ResolverWildcardNotSupported();

error ResolverNotContract();

error LookupSenderMismatched();

error ResolverError(bytes returnData);

error HttpError(uint16 status, string message);

struct OffchainLookupCallData {
    address sender;
    string[] urls;
    bytes callData;
}

interface BatchGateway2 {
    function query(
        address sender,
        string[] memory urls,
        bytes memory callData
    ) external returns (bytes memory response);
}

contract UniversalResolver2 is
    ERC3668Multicallable,
    ERC3668Caller,
    ENSIP10ResolverFinder
{
    using Strings for uint256;
    using Address for address;
    using NameEncoder for string;
    using HexUtils for bytes;
    using BytesUtils for bytes;

    string[] public _urls;
    uint256 private constant SLIP44_MSB = 0x80000000;

    constructor(
        ENS registry_,
        string[] memory urls_
    ) ENSIP10ResolverFinder(registry_) {
        _urls = urls_;
    }

    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result, address resolver) {
        return resolveWithGateways(name, data, _urls);
    }

    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory result, address resolver) {
        uint256 finalOffset;
        (resolver, , finalOffset) = findResolver(name);
        if (resolver == address(0)) {
            revert ResolverNotFound();
        }

        if (!resolver.isContract()) {
            revert ResolverNotContract();
        }

        bool isWildcard = finalOffset != 0;
        bool isExtendedResolver = _checkInterface(
            resolver,
            type(IExtendedResolver).interfaceId
        );

        if (isWildcard && !isExtendedResolver) {
            revert ResolverWildcardNotSupported();
        }

        bool resolverSupportsMulticall = _checkInterface(
            resolver,
            type(IMulticallableSimple).interfaceId
        ) || _checkInterface(resolver, type(IMulticallable).interfaceId);

        bool isSingleInternallyEncodedCall = bytes4(data) !=
            MulticallableGateway.multicall.selector;
        bytes[] memory calls;

        if (isSingleInternallyEncodedCall) {
            calls = new bytes[](1);
            calls[0] = data;
        } else {
            calls = abi.decode(data[4:], (bytes[]));
        }

        if (resolverSupportsMulticall)
            return
                _externalMulticall(
                    name,
                    calls,
                    resolver,
                    isSingleInternallyEncodedCall,
                    isExtendedResolver
                );

        return
            _internalMulticall(
                name,
                calls,
                resolver,
                gateways,
                isSingleInternallyEncodedCall,
                isExtendedResolver
            );
    }

    function internalCallCallback(
        bytes memory response,
        bytes calldata /* extraData */
    ) external pure returns (bytes memory) {
        assembly {
            return(add(response, 32), mload(response))
        }
    }

    function internalCallCalldataRewrite(
        OffchainLookupData memory data
    ) external pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                BatchGateway2.query.selector,
                data.sender,
                data.urls,
                data.callData
            );
    }

    function internalCall(
        address target,
        bytes calldata data,
        uint256 gas
    ) external view returns (bytes memory) {
        return
            call(
                target,
                gas,
                data,
                "",
                this.internalCallCallback.selector,
                this.internalCallCalldataRewrite.selector,
                bytes4(0)
            );
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (bytes memory, address) {
        (
            address resolver,
            bool isSingleInternallyEncodedCall,
            bool isExtendedResolver
        ) = abi.decode(extraData, (address, bool, bool));

        if (isSingleInternallyEncodedCall)
            return (
                _resultFromSingleInternallyEncodedCall(
                    response,
                    isExtendedResolver
                ),
                resolver
            );

        if (!isExtendedResolver) return (response, resolver);

        bytes[] memory results = abi.decode(response, (bytes[]));
        for (uint256 i = 0; i < results.length; i++) {
            results[i] = _decodeExtendedResolverResult(results[i]);
        }

        return (abi.encode(results), resolver);
    }

    function reverse(
        bytes memory lookupAddress,
        uint256 coinType
    )
        public
        view
        returns (string memory name, address resolver, address reverseResolver)
    {
        return reverseWithGateways(lookupAddress, coinType, _urls);
    }

    function reverseWithGateways(
        bytes memory lookupAddress,
        uint256 coinType,
        string[] memory gateways
    ) public view returns (string memory, address, address) {
        (
            bytes memory reverseName,
            bytes32 reverseNamehash
        ) = _createReverseNode(lookupAddress, coinType).dnsEncodeName();
        bytes memory nameCall = abi.encodeWithSelector(
            INameResolver.name.selector,
            reverseNamehash
        );
        bytes memory encodedCall = abi.encodeWithSelector(
            this.resolveWithGateways.selector,
            reverseName,
            nameCall,
            gateways
        );

        call(
            address(this),
            0,
            encodedCall,
            abi.encode(lookupAddress, coinType, gateways),
            this.forwardLookupReverseCallback.selector,
            bytes4(0),
            this.defaultCoinTypeReverseCallback.selector
        );
    }

    function defaultCoinTypeReverseCallback(
        bytes calldata /* response */,
        bytes calldata extraData
    ) external view returns (string memory, address, address) {
        (
            bytes memory lookupAddress,
            uint256 coinType,
            string[] memory gateways
        ) = abi.decode(extraData, (bytes, uint256, string[]));
        // not sure if this should propagate the revert data or just use the custom error
        if (coinType == SLIP44_MSB || !_isEvmChain(coinType))
            revert ReverseNodeNotFound();
        return reverseWithGateways(lookupAddress, SLIP44_MSB, gateways);
    }

    function forwardLookupReverseCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (string memory, address, address) {
        (
            bytes memory lookupAddress,
            uint256 coinType,
            string[] memory gateways
        ) = abi.decode(extraData, (bytes, uint256, string[]));
        (bytes memory result, address reverseResolver) = abi.decode(
            response,
            (bytes, address)
        );
        string memory resolvedName = abi.decode(result, (string));
        (bytes memory encodedName, bytes32 namehash) = resolvedName
            .dnsEncodeName();
        bytes memory addrCall = abi.encodeWithSelector(
            IAddressResolver.addr.selector,
            namehash,
            coinType
        );
        bytes memory encodedCall = abi.encodeWithSelector(
            this.resolveWithGateways.selector,
            encodedName,
            addrCall,
            gateways
        );
        call(
            address(this),
            0,
            encodedCall,
            abi.encode(
                lookupAddress,
                coinType,
                gateways,
                resolvedName,
                reverseResolver,
                false
            ),
            this.processLookupReverseCallback.selector,
            bytes4(0),
            coinType == 60
                ? this.attemptAddrResolverReverseCallback.selector
                : bytes4(0)
        );
    }

    function attemptAddrResolverReverseCallback(
        bytes calldata /* response */,
        bytes calldata extraData
    ) external view returns (string memory, address, address) {
        (
            bytes memory lookupAddress,
            uint256 coinType,
            string[] memory gateways,
            string memory resolvedName,
            address reverseResolver
        ) = abi.decode(extraData, (bytes, uint256, string[], string, address));
        (bytes memory encodedName, bytes32 namehash) = resolvedName
            .dnsEncodeName();
        bytes memory addrCall = abi.encodeWithSelector(
            IAddrResolver.addr.selector,
            namehash
        );
        bytes memory encodedCall = abi.encodeWithSelector(
            this.resolveWithGateways.selector,
            encodedName,
            addrCall,
            gateways
        );
        call(
            address(this),
            0,
            encodedCall,
            abi.encode(
                lookupAddress,
                coinType,
                gateways,
                resolvedName,
                reverseResolver,
                true
            ),
            this.processLookupReverseCallback.selector
        );
    }

    function processLookupReverseCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (string memory, address, address) {
        (
            bytes memory lookupAddress,
            uint256 coinType,
            ,
            string memory resolvedName,
            address reverseResolver,
            bool isAddrCall
        ) = abi.decode(
                extraData,
                (bytes, uint256, string[], string, address, bool)
            );
        (bytes memory result, address resolver) = abi.decode(
            response,
            (bytes, address)
        );
        if (_isEvmChain(coinType)) {
            bytes memory unwrappedResultMaybe = isAddrCall
                ? abi.encodePacked(abi.decode(result, (address)))
                : abi.decode(result, (bytes));
            address resolvedAddress = _bytesToAddress(unwrappedResultMaybe);
            address decodedLookupAddress = _bytesToAddress(lookupAddress);
            if (resolvedAddress != decodedLookupAddress) {
                revert ReverseAddressMismatch(
                    abi.encodePacked(resolvedAddress)
                );
            }
        } else {
            if (keccak256(result) != keccak256(lookupAddress)) {
                revert ReverseAddressMismatch(result);
            }
        }
        return (resolvedName, reverseResolver, resolver);
    }

    function _externalMulticall(
        bytes calldata name,
        bytes[] memory calls,
        address resolver,
        bool isSingleInternallyEncodedCall,
        bool isExtendedResolver
    ) internal view returns (bytes memory, address) {
        call(
            resolver,
            0,
            _createExternalMulticall(name, calls, resolver, isExtendedResolver),
            abi.encode(
                resolver,
                isSingleInternallyEncodedCall,
                isExtendedResolver
            ),
            this.resolveCallback.selector
        );
    }

    function _internalMulticall(
        bytes calldata name,
        bytes[] memory calls,
        address resolver,
        string[] memory gateways,
        bool isSingleInternallyEncodedCall,
        bool isExtendedResolver
    ) internal view returns (bytes memory, address) {
        call(
            address(this),
            0,
            _createInternalMulticall(
                name,
                calls,
                resolver,
                gateways,
                isExtendedResolver
            ),
            abi.encode(
                resolver,
                isSingleInternallyEncodedCall,
                isExtendedResolver
            ),
            this.resolveCallback.selector
        );
    }

    function _encodeCallWithResolve(
        bytes memory name,
        bytes memory data
    ) internal pure returns (bytes memory) {
        return abi.encodeCall(IExtendedResolver.resolve, (name, data));
    }

    function _createInternalMulticall(
        bytes calldata name,
        bytes[] memory calls,
        address resolver,
        string[] memory gateways,
        bool isExtendedResolver
    ) internal view returns (bytes memory) {
        for (uint256 i = 0; i < calls.length; i++) {
            bool isSafe;
            if (isExtendedResolver) {
                calls[i] = _encodeCallWithResolve(name, calls[i]);
                isSafe = true;
            } else {
                isSafe = _checkInterface(resolver, bytes4(calls[i]));
            }
            calls[i] = abi.encodeWithSelector(
                this.internalCall.selector,
                resolver,
                calls[i],
                isSafe ? 0 : 50000
            );
        }

        return abi.encodeWithSelector(this.multicall.selector, calls, gateways);
    }

    function _createExternalMulticall(
        bytes calldata name,
        bytes[] memory calls,
        address resolver,
        bool isExtendedResolver
    ) internal view returns (bytes memory) {
        if (isExtendedResolver) {
            for (uint256 i = 0; i < calls.length; i++) {
                calls[i] = _encodeCallWithResolve(name, calls[i]);
            }
        } else {
            for (uint256 i = 0; i < calls.length; i++) {
                bool interfaceSupported = _checkInterface(
                    resolver,
                    bytes4(calls[i])
                );
                // only allow explicitly supported interfaces in non-extended resolver mode
                // this is because we can't control gas inside the multicall per call
                // and for a function that doesn't exist in older solidity versions, it will consume all the gas and revert the whole call
                if (!interfaceSupported) calls[i] = "";
            }
        }
        return
            abi.encodeWithSelector(
                MulticallableGateway.multicall.selector,
                calls
            );
    }

    function _isEmptyResult(bytes memory result) internal pure returns (bool) {
        return result.length == 0;
    }

    function _isErrorResult(bytes memory result) internal pure returns (bool) {
        return result.length % 32 == 4;
    }

    function _decodeExtendedResolverResult(
        bytes memory result
    ) internal pure returns (bytes memory) {
        if (_isEmptyResult(result)) return result;
        if (_isErrorResult(result)) return result;
        return abi.decode(result, (bytes));
    }

    function _resultFromSingleInternallyEncodedCall(
        bytes calldata result,
        bool isExtendedResolver
    ) internal pure returns (bytes memory) {
        bytes[] memory results = abi.decode(result, (bytes[]));
        bytes memory item = results[0];

        if (_isEmptyResult(item) || _isErrorResult(item)) {
            if (bytes4(item) == HttpError.selector)
                LowLevelCallUtils.propagateRevert(item);

            revert ResolverError(item);
        }

        if (isExtendedResolver) return abi.decode(item, (bytes));

        return item;
    }

    function _checkInterface(
        address resolver,
        bytes4 interfaceId
    ) internal view returns (bool) {
        try
            Resolver(resolver).supportsInterface{gas: 50000}(interfaceId)
        returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    function _createReverseNode(
        bytes memory lookupAddress,
        uint256 coinType
    ) internal pure returns (string memory) {
        return
            string(
                bytes.concat(
                    _bytesToHexStringBytes(lookupAddress),
                    ".",
                    coinType == 60
                        ? bytes("addr")
                        : bytes(coinType.toHexString()),
                    ".reverse"
                )
            );
    }

    function _isEvmChain(uint256 coinType) internal pure returns (bool) {
        if (coinType == 60) return true;
        return (coinType & SLIP44_MSB) != 0;
    }

    function _bytesToAddress(bytes memory b) internal pure returns (address a) {
        require(b.length == 20);
        assembly {
            a := div(mload(add(b, 32)), exp(256, 12))
        }
    }

    function _bytesToHexStringBytes(
        bytes memory data
    ) internal pure returns (bytes memory) {
        bytes memory result = new bytes(data.length * 2);
        bytes16 _base = "0123456789abcdef";

        for (uint256 i = 0; i < data.length; i++) {
            result[i * 2] = _base[uint8(data[i]) / 16];
            result[i * 2 + 1] = _base[uint8(data[i]) % 16];
        }

        return result;
    }
}
