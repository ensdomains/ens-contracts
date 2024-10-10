// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {PrefixlessHexUtils} from "../utils/PrefixlessHexUtils.sol";
import {ENS} from "../registry/ENS.sol";
import {IMulticallGateway} from "./IMulticallGateway.sol";
import {IBatchGateway} from "./IBatchGateway.sol";
import {ERC3668Multicallable} from "./ERC3668Multicallable.sol";
import {ERC3668Caller} from "./ERC3668Caller.sol";
import {ENSIP10ResolverFinder} from "./ENSIP10ResolverFinder.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {OffchainLookupData} from "../utils/ERC3668Utils.sol";
import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {BytesArrayValidator} from "./BytesArrayValidator.sol";
import {NameEncoder} from "../utils/NameEncoder.sol";
import {IUniversalResolver} from "./IUniversalResolver.sol";

/// @title UniversalResolver
/// @notice The universal entrypoint for ENS resolution.
contract UniversalResolver is
    ERC3668Multicallable,
    ERC3668Caller,
    ENSIP10ResolverFinder,
    ERC165,
    IUniversalResolver
{
    /// @notice Batch gateway URLs to use for offchain resolution.
    ///         Gateways should implement IBatchGateway.
    string[] public _urls;
    /// @notice The SLIP44 most-significant bit for EVM chains.
    ///         See ENSIP-11 for reference: https://docs.ens.domains/ensip/11
    uint256 private constant SLIP44_MSB = 0x80000000;

    /// @notice Sets the batch gateway URLs and ENS registry.
    /// @param registry_ The ENS registry.
    /// @param urls_ The batch gateway URLs.
    constructor(
        ENS registry_,
        string[] memory urls_
    ) ENSIP10ResolverFinder(registry_) {
        _urls = urls_;
    }

    /*//////////////////////////////////////////////////////////////
                                RESOLVE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IUniversalResolver
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result, address resolver) {
        return resolveWithGateways(name, data, _urls);
    }

    /// @notice Performs ENS name resolution for the supplied name, resolution data, and batch gateway URLs.
    /// @param name The name to resolve, in normalised and DNS-encoded form.
    /// @param data The resolution data, as specified in ENSIP-10.
    ///             For a multicall, the data should be encoded as `(bytes[])`.
    /// @param gateways The batch gateway URLs to use for offchain resolution.
    ///                 Gateways should implement IBatchGateway.
    /// @return result The result of the resolution.
    ///                For a multicall, the result is encoded as `(bytes[])`.
    /// @return resolver The resolver that was used to resolve the name.
    function resolveWithGateways(
        bytes calldata name,
        bytes calldata data,
        string[] memory gateways
    ) public view returns (bytes memory result, address resolver) {
        uint256 finalOffset;
        (resolver, , finalOffset) = findResolver(name);

        if (resolver == address(0)) revert ResolverNotFound(name);
        if (!Address.isContract(resolver)) revert ResolverNotContract(name);

        bool isWildcard = finalOffset != 0;
        bool isExtendedResolver = _checkInterface(
            resolver,
            type(IExtendedResolver).interfaceId
        );

        if (isWildcard && !isExtendedResolver) revert ResolverNotFound(name);

        bool isSingleInternallyEncodedCall = bytes4(data) !=
            IMulticallGateway.multicall.selector;
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

    /*//////////////////////////////////////////////////////////////
                            RESOLVE MULTICALL
    //////////////////////////////////////////////////////////////*/

    /// @dev Creates a call to resolve a name using an extended resolver.
    function _createResolveMulticall(
        bytes calldata name,
        bytes[] memory calls
    ) internal pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                IExtendedResolver.resolve.selector,
                name,
                abi.encodeWithSelector(IMulticallGateway.multicall.selector, calls)
            );
    }

    /// @dev Attempts to resolve a name with `resolve(multicall(calls))` using `call`.
    ///      Will fallback to `_internalMulticall` if it fails
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

    /*//////////////////////////////////////////////////////////////
                            INTERNAL MULTICALL
    //////////////////////////////////////////////////////////////*/

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

    /*//////////////////////////////////////////////////////////////
                            INTERNAL CALL
    //////////////////////////////////////////////////////////////*/

    function _internalCallCallback(
        bytes memory response,
        bytes calldata /* extraData */
    ) external pure returns (bytes memory) {
        assembly {
            return(add(response, 32), mload(response))
        }
    }

    function _internalCallCalldataRewrite(
        OffchainLookupData memory data
    ) external pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                IBatchGateway.query.selector,
                data.sender,
                data.urls,
                data.callData
            );
    }

    function _internalCallValidateResponse(
        bytes calldata response
    ) external pure {
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
    ) external view {
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

    /*//////////////////////////////////////////////////////////////
                                REVERSE
    //////////////////////////////////////////////////////////////*/

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
        ) = NameEncoder.dnsEncodeName(_createReverseNode(lookupAddress, coinType));
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
        (bytes memory encodedName, bytes32 namehash) = NameEncoder.dnsEncodeName(resolvedName);
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
            address reverseResolver,

        ) = abi.decode(
                extraData,
                (bytes, uint256, string[], string, address, bool)
            );
        (bytes memory encodedName, bytes32 namehash) = NameEncoder.dnsEncodeName(resolvedName);
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
        return (resolvedName, resolver, reverseResolver);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

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
            ERC165(resolver).supportsInterface{gas: 50000}(interfaceId)
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
                    PrefixlessHexUtils.toHexString(lookupAddress),
                    ".",
                    coinType == 60 ? bytes("addr") : PrefixlessHexUtils.toHexString(coinType),
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

    /*//////////////////////////////////////////////////////////////
                                ERC165
    //////////////////////////////////////////////////////////////*/

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IUniversalResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
