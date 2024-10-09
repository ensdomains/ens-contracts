// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {PrefixlessHexStrings} from "../utils/PrefixlessHexStrings.sol";
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
import {HexUtils} from "../utils/HexUtils.sol";
import {BytesArrayValidator} from "./BytesArrayValidator.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";
import {NameEncoder} from "../utils/NameEncoder.sol";

error ResolverNotFound();

error ReverseNodeNotFound();

error ReverseAddressMismatch(bytes result);

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

contract UniversalResolver3 is
    ERC3668Multicallable,
    ERC3668Caller,
    ENSIP10ResolverFinder
{
    using PrefixlessHexStrings for uint256;
    using PrefixlessHexStrings for bytes;
    using Address for address;
    using NameEncoder for string;
    using HexUtils for bytes;
    using BytesUtils for bytes;
    using BytesArrayValidator for bytes;

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

        if (resolver == address(0)) revert ResolverNotFound();
        if (!resolver.isContract()) revert ResolverNotContract();

        bool isWildcard = finalOffset != 0;
        bool isExtendedResolver = _checkInterface(
            resolver,
            type(IExtendedResolver).interfaceId
        );

        if (isWildcard && !isExtendedResolver) revert ResolverNotFound();

        bool isSingleInternallyEncodedCall = bytes4(data) !=
            MulticallableGateway.multicall.selector;
        bytes[] memory calls;

        if (isSingleInternallyEncodedCall) {
            calls = new bytes[](1);
            calls[0] = data;
        } else {
            calls = abi.decode(data[4:], (bytes[]));
        }

        if (isExtendedResolver)
            return
                _attemptResolveMulticall(
                    name,
                    calls,
                    resolver,
                    gateways,
                    isSingleInternallyEncodedCall
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

    /**
     * resolve(multicall(calls))
     */

    function _createResolveMulticall(
        bytes calldata name,
        bytes[] memory calls
    ) internal pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                IExtendedResolver.resolve.selector,
                name,
                abi.encodeWithSelector(IMulticallable.multicall.selector, calls)
            );
    }

    function _attemptResolveMulticall(
        bytes calldata name,
        bytes[] memory calls,
        address resolver,
        string[] memory gateways,
        bool isSingleInternallyEncodedCall
    ) internal view returns (bytes memory, address) {
        call(
            resolver,
            0,
            _createResolveMulticall(name, calls),
            abi.encode(
                name,
                calls,
                resolver,
                gateways,
                isSingleInternallyEncodedCall
            ),
            createUserCallbackFunctions(
                this.resolveMulticallResolveCallback.selector,
                bytes4(0),
                this.resolveMulticallResolveCallback.selector,
                bytes4(0)
            )
        );
    }

    function resolveMulticallResolveCallback(
        bytes memory response,
        bytes calldata extraData
    ) external view returns (bytes memory, address) {
        (
            bytes memory name,
            bytes[] memory calls,
            address resolver,
            string[] memory gateways,
            bool isSingleInternallyEncodedCall
        ) = abi.decode(extraData, (bytes, bytes[], address, string[], bool));

        if (
            _isErrorResult(response) ||
            _isEmptyResult(response) ||
            !BytesArrayValidator.isValidBytesArray(
                response = abi.decode(response, (bytes))
            )
        )
            return
                _internalMulticall(
                    name,
                    calls,
                    resolver,
                    gateways,
                    isSingleInternallyEncodedCall,
                    true
                );

        if (isSingleInternallyEncodedCall)
            return (
                _resultFromSingleInternallyEncodedCall(response, false),
                resolver
            );

        return (response, resolver);
    }

    /**
     * multicall(calls)
     */

    function _createInternalMulticall(
        bytes memory name,
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
                this._internalCall.selector,
                resolver,
                calls[i],
                isSafe ? 0 : 50000
            );
        }

        return abi.encodeWithSelector(this.multicall.selector, calls, gateways);
    }

    function _internalMulticall(
        bytes memory name,
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
            uint32(this.internalMulticallResolveCallback.selector)
        );
    }

    function internalMulticallResolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory, address) {
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

    /**
     * Internal call
     */

    function _internalCallCallback(
        bytes memory response,
        bytes calldata /* extraData */
    ) external view returns (bytes memory) {
        assembly {
            return(add(response, 32), mload(response))
        }
    }

    function _internalCallCalldataRewrite(
        OffchainLookupData memory data
    ) external view returns (bytes memory) {
        return
            abi.encodeWithSelector(
                BatchGateway2.query.selector,
                data.sender,
                data.urls,
                data.callData
            );
    }

    function _internalCallValidateResponse(
        bytes calldata response
    ) external view {
        if (bytes4(response) == HttpError.selector) {
            (uint16 status, string memory message) = abi.decode(
                response[4:],
                (uint16, string)
            );
            revert HttpError(status, message);
        }
    }

    function _internalCall(
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
                createUserCallbackFunctions(
                    this._internalCallCallback.selector,
                    this._internalCallCalldataRewrite.selector,
                    bytes4(0),
                    this._internalCallValidateResponse.selector
                )
            );
    }

    /**
     * Reverse
     */

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
            uint32(this.forwardLookupReverseCallback.selector)
        );
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
        uint128 userCallbackFunctions = createUserCallbackFunctions(
            this.processLookupReverseCallback.selector,
            bytes4(0),
            coinType == 60
                ? this.attemptAddrResolverReverseCallback.selector
                : bytes4(0),
            bytes4(0)
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
            userCallbackFunctions
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
            uint32(this.processLookupReverseCallback.selector)
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
        bytes memory unwrappedResult = isAddrCall
            ? abi.encodePacked(abi.decode(result, (address)))
            : abi.decode(result, (bytes));
        if (_isEvmChain(coinType)) {
            address resolvedAddress = _bytesToAddress(unwrappedResult);
            address decodedLookupAddress = _bytesToAddress(lookupAddress);
            if (resolvedAddress != decodedLookupAddress) {
                revert ReverseAddressMismatch(
                    abi.encodePacked(resolvedAddress)
                );
            }
        } else {
            if (keccak256(unwrappedResult) != keccak256(lookupAddress)) {
                revert ReverseAddressMismatch(unwrappedResult);
            }
        }
        return (resolvedName, reverseResolver, resolver);
    }

    function _encodeCallWithResolve(
        bytes memory name,
        bytes memory data
    ) internal pure returns (bytes memory) {
        return abi.encodeCall(IExtendedResolver.resolve, (name, data));
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
        bytes memory result,
        bool shouldDecodeResult
    ) internal pure returns (bytes memory) {
        bytes[] memory results = abi.decode(result, (bytes[]));
        bytes memory item = results[0];

        if (_isEmptyResult(item) || _isErrorResult(item)) {
            if (bytes4(item) == HttpError.selector)
                LowLevelCallUtils.propagateRevert(item);

            revert ResolverError(item);
        }

        if (shouldDecodeResult) return abi.decode(item, (bytes));

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
    ) internal view returns (string memory) {
        return
            string(
                bytes.concat(
                    lookupAddress.toHexString(),
                    ".",
                    coinType == 60 ? bytes("addr") : coinType.toHexString(),
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
}
