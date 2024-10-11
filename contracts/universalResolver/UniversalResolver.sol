// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC165, IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

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

//                                             ENS:E   ENS                                             
//                                         ENS:ENS:     ENS:EN                                         
//                                     ENS:ENS:ENS       ENS:ENS:                                      
//                                 ENS:ENS:ENS:E           ENS:ENS:EN                                  
//                              ENS:ENS:ENS:ENS             ENS:ENS:ENS:                               
//                           ENS:ENS:ENS:ENS:                 ENS:ENS:ENS:EN                           
//                        ENS:ENS:ENS:ENS:EN                    ENS:ENS:ENS:ENS                        
//                     ENS:ENS:ENS:ENS:ENS                       ENS:ENS:ENS:ENS:EN                    
//                  ENS:ENS:ENS:ENS:ENS:E                          ENS:ENS:ENS:ENS:ENS                 
//                ENS:ENS:ENS:ENS:ENS:E                              ENS:ENS:ENS:ENS:ENS:              
//              ENS:ENS:ENS:ENS:ENS:EN                                ENS:ENS:ENS:ENS:ENS:E            
//            ENS:ENS:ENS:ENS:ENS:EN                                    ENS:ENS:ENS:ENS:ENS:E          
//           ENS:ENS:ENS:ENS:ENS:EN                                      ENS:ENS:ENS:ENS:ENS:EN        
//           ENS:ENS:ENS:ENS:ENS:                                          ENS:ENS:ENS:ENS:ENS:E       
//          ENS:ENS:ENS:ENS:ENS:                                            ENS:ENS:ENS:ENS:ENS:E      
//          ENS:ENS:ENS:ENS:EN                                                ENS:ENS:ENS:ENS:ENS:E    
//   ENS    ENS:ENS:ENS:ENS:E                                                  ENS:ENS:ENS:ENS:ENS:E   
//   ENS     ENS:ENS:ENS:EN                                                      ENS:ENS:ENS:ENS:ENS:  
//  ENS:E    ENS:ENS:ENS:E                                                         ENS:ENS:ENS:ENS:EN  
// ENS:ENS    ENS:ENS:EN                                                            ENS:ENS:ENS:ENS:EN 
// ENS:ENS:     ENS:ENS                                                               ENS:ENS:ENS:ENS: 
// ENS:ENS:E     ENS:                                                                  ENS:ENS:ENS:ENS:
// ENS:ENS:ENS                                                                           ENS:ENS:ENS:EN
// ENS:ENS:ENS:                                                                            ENS:ENS:ENS:
// ENS:ENS:ENS:EN                                                                           ENS:ENS:ENS
// ENS:ENS:ENS:ENS:                                                                 ENS:     ENS:ENS:EN
// ENS:ENS:ENS:ENS:E                                                               ENS:ENS     ENS:ENS:
//  ENS:ENS:ENS:ENS:E                                                             ENS:ENS:E     ENS:EN 
//  ENS:ENS:ENS:ENS:ENS                                                         ENS:ENS:ENS:     ENS:E 
//   ENS:ENS:ENS:ENS:ENS:                                                      ENS:ENS:ENS:EN     ENS  
//    ENS:ENS:ENS:ENS:ENS:                                                   ENS:ENS:ENS:ENS:     ENS  
//     ENS:ENS:ENS:ENS:ENS:E                                                ENS:ENS:ENS:ENS:EN         
//      ENS:ENS:ENS:ENS:ENS:EN                                            ENS:ENS:ENS:ENS:ENS:         
//        ENS:ENS:ENS:ENS:ENS:E                                          ENS:ENS:ENS:ENS:ENS:          
//         ENS:ENS:ENS:ENS:ENS:EN                                      ENS:ENS:ENS:ENS:ENS:EN          
//           ENS:ENS:ENS:ENS:ENS:E                                    ENS:ENS:ENS:ENS:ENS:E            
//             ENS:ENS:ENS:ENS:ENS:E                                ENS:ENS:ENS:ENS:ENS:EN             
//               ENS:ENS:ENS:ENS:ENS:                              ENS:ENS:ENS:ENS:ENS:E               
//                  ENS:ENS:ENS:ENS:ENS                          ENS:ENS:ENS:ENS:ENS:E                 
//                     ENS:ENS:ENS:ENS:EN                       ENS:ENS:ENS:ENS:ENS                    
//                        ENS:ENS:ENS:ENS:                    ENS:ENS:ENS:ENS:EN                       
//                            ENS:ENS:ENS:EN                 ENS:ENS:ENS:ENS:                          
//                               ENS:ENS:ENS:              ENS:ENS:ENS:ENS                             
//                                   ENS:ENS:EN           ENS:ENS:ENS:                                 
//                                      ENS:ENS:E       ENS:ENS:ENS                                    
//                                         ENS:ENS     ENS:ENS:                                        
//                                             ENS:   ENS:                                             

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
                                REVERSE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IUniversalResolver
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

    /// @notice Performs ENS reverse resolution for the supplied address, coin type, and batch gateway URLs.
    /// @param lookupAddress The address to reverse resolve, in encoded form.
    /// @param coinType The coin type to use for the reverse resolution.
    ///                 For ETH, this is 60.
    ///                 For other EVM chains, coinType is calculated as `0x80000000 | chainId`.
    /// @param gateways The batch gateway URLs to use for offchain resolution.
    ///                 Gateways should implement IBatchGateway.
    /// @return name The reverse resolution result.
    /// @return resolver The resolver that was used to resolve the name.
    /// @return reverseResolver The resolver that was used to resolve the reverse name.
    function reverseWithGateways(
        bytes memory lookupAddress,
        uint256 coinType,
        string[] memory gateways
    ) public view returns (string memory /* name */, address /* resolver */, address /* reverseResolver */) {
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
            uint32(this._forwardLookupReverseCallback.selector)
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
    ) internal view returns (bytes memory /* result */, address /* resolver */) {
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
                this._resolveMulticallResolveCallback.selector,
                bytes4(0),
                // setting this allows a callback to _resolveMulticallResolveCallback even if the call fails
                // meaning that the data in _resolveMulticallResolveCallback can potentially be invalid/error data
                this._resolveMulticallResolveCallback.selector,
                bytes4(0)
            )
        );
    }

    /// @dev Callback for resolving a name with `resolve(multicall(calls))` using `call`.
    ///      Will fallback to `_internalMulticall` if the result is not valid.
    ///      `response` can potentially be invalid/error data.
    /// @notice This function should never be called directly.
    function _resolveMulticallResolveCallback(
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

    /// @dev Creates a call to resolve a name with `multicall(calls)` or `multicall(...resolve(name, call))`.
    ///      A call is made to `multicall` on this contract, which is possible since it extends `ERC3668Multicallable`.
    ///      Calls are also wrapped in `_internalCall`, which routes all the external calls through this contract
    ///      meaning that a batch gateway can be used (via calldata rewriting in `_internalCallCalldataRewrite`).
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
                // extended resolver calls need to be wrapped with `resolve(name, call)`
                calls[i] = _encodeCallWithResolve(name, calls[i]);
                // extended resolver calls are assumed safe because they are
                // almost definitely all deployed with solidity > 0.4.11
                // (also we can't check that the interface is supported)
                isSafe = true;
            } else {
                // this is required to prevent calls from using all the gas
                // if it reverts (solidity < 0.4.11)
                isSafe = _checkInterface(resolver, bytes4(calls[i]));
            }
            calls[i] = abi.encodeWithSelector(
                this._internalCall.selector,
                resolver,
                calls[i],
                // 50k gas is arbitrary, but should be more than enough where required
                isSafe ? 0 : 50000
            );
        }

        return abi.encodeWithSelector(this.multicall.selector, calls, gateways);
    }

    /// @dev Resolves a name with `multicall(calls)` or `multicall(...resolve(name, call))`.
    function _internalMulticall(
        bytes memory name,
        bytes[] memory calls,
        address resolver,
        string[] memory gateways,
        bool isSingleInternallyEncodedCall,
        bool isExtendedResolver
    ) internal view returns (bytes memory /* result */, address /* resolver */) {
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
            uint32(this._internalMulticallResolveCallback.selector)
        );
    }

    /// @dev Callback for resolving a name with `multicall(calls)` or `multicall(...resolve(name, call))`.
    /// @notice This function should never be called directly.
    function _internalMulticallResolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (bytes memory /* result */, address /* resolver */) {
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
                            REVERSE CALLBACKS
    //////////////////////////////////////////////////////////////*/

    /// @dev Callback for resolving `addr(bytes32, uint256)` based on the name
    ///      from reverse resolution. For ETH, there is a fallback to
    ///      `addr(bytes32)` if the `addr(bytes32, uint256)` call reverts.
    /// @notice This function should never be called directly.
    function _forwardLookupReverseCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (string memory /* name */, address /* resolver */, address /* reverseResolver */) {
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
            this._processLookupReverseCallback.selector,
            bytes4(0),
            // for ETH coinType, fallback to `addr(bytes32)` on failure
            coinType == 60
                ? this._attemptAddrResolverReverseCallback.selector
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
                false // isAddrCall (i.e. `addr(bytes32)`)
            ),
            userCallbackFunctions
        );
    }

    /// @dev Callback for attempting a fallback to `addr(bytes32)` if
    ///      `addr(bytes32, uint256)` reverts.
    /// @notice This function should never be called directly.
    function _attemptAddrResolverReverseCallback(
        bytes calldata /* response */,
        bytes calldata extraData
    ) external view returns (string memory /* name */, address /* resolver */, address /* reverseResolver */) {
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
                true // isAddrCall (i.e. `addr(bytes32)`)
            ),
            uint32(this._processLookupReverseCallback.selector)
        );
    }

    /// @dev Callback for handling the result from reverse resolution.
    /// @notice This function should never be called directly.
    function _processLookupReverseCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (string memory /* name */, address /* resolver */, address /* reverseResolver */) {
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
        // for `addr(bytes32)` the result needs to be unwrapped to a left-padded bytes32
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
                            INTERNAL CALL
    //////////////////////////////////////////////////////////////*/

    /// @dev Callback for handling a single internal call.
    ///      Just returns the response directly since no validation is needed.
    /// @notice This function should never be called directly.
    function _internalCallCallback(
        bytes memory response,
        bytes calldata /* extraData */
    ) external pure returns (bytes memory) {
        assembly {
            return(add(response, 32), mload(response))
        }
    }

    /// @dev Callback for rewriting the OffchainLookup calldata.
    ///      Rewrites to be compatible with `IBatchGateway.query`.
    /// @notice This function should never be called directly.
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

    /// @dev Callback for validating the response from an internal call.
    ///      Since calls are routed through a BatchGateway, the response
    ///      can be an HTTP error. This needs to be handled immediately before
    ///      calling the external callback since the external function won't
    ///      understand the error format.
    /// @notice This function should never be called directly.
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

    /// @dev Routes an internal call through this contract.
    ///      This allows rewriting for BatchGateway, and also validating the
    ///      response to ensure it's not an HTTP error.
    /// @notice This function should never be called directly.
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
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Encodes a call with `resolve(name, call)`.
    function _encodeCallWithResolve(
        bytes memory name,
        bytes memory data
    ) internal pure returns (bytes memory) {
        return abi.encodeCall(IExtendedResolver.resolve, (name, data));
    }

    /// @dev Checks if a result is empty.
    function _isEmptyResult(bytes memory result) internal pure returns (bool) {
        return result.length == 0;
    }

    /// @dev Checks if a result is an error.
    function _isErrorResult(bytes memory result) internal pure returns (bool) {
        return result.length % 32 == 4;
    }

    /// @dev Decodes a result from an extended resolver.
    ///      This is required since all extended resolver calls are
    ///      wrapped in `resolve(name, call)`, which returns `bytes`.
    ///      `bytes` should be unwrapped to get the actual result,
    ///      but if the result is an error or empty, it needs to be 
    ///      left as is since it can't be decoded. For a client, 
    ///      this is fine since they will handle error/empty results
    ///      anyway.
    function _decodeExtendedResolverResult(
        bytes memory result
    ) internal pure returns (bytes memory) {
        if (_isEmptyResult(result)) return result;
        if (_isErrorResult(result)) return result;
        return abi.decode(result, (bytes));
    }

    /// @dev Decodes a result from a single internally encoded call.
    ///      This is required since the default encoding assumes a multicall, 
    ///      so it needs to be unwrapped. Or, if the result is an error, 
    ///      it needs to be propagated directly.
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

    /// @dev Checks if a resolver supports an interface.
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

    /// @dev Creates the DNS-encoded reverse name for a given address and coin type.
    ///      For ETH, this is `[address].addr.reverse`
    ///      Example: 0x123...456 => 123...456.addr.reverse
    ///      For other coinTypes, this is `[address].[coinType].reverse`
    ///      EVM chain example: 0x123...456, 0x8000000a => 123...456.8000000a.reverse
    ///      Non-EVM chain example: 0x123...456, 0x1fa => 123...456.01fa.reverse
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

    /// @dev Checks if a coin type is for an EVM chain.
    function _isEvmChain(uint256 coinType) internal pure returns (bool) {
        if (coinType == 60) return true;
        return (coinType & SLIP44_MSB) != 0;
    }

    /// @dev Converts a bytes value to an address.
    function _bytesToAddress(bytes memory b) internal pure returns (address a) {
        require(b.length == 20);
        assembly {
            a := div(mload(add(b, 32)), exp(256, 12))
        }
    }

    /*//////////////////////////////////////////////////////////////
                                ERC165
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IUniversalResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
