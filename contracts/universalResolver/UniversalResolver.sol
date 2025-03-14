// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IUniversalResolver} from "./IUniversalResolver.sol";
import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";
import {ENS} from "../registry/ENS.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {Resolver, INameResolver, IAddrResolver} from "../resolvers/Resolver.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";
import {NameEncoder} from "../utils/NameEncoder.sol";
import {HexUtils} from "../utils/HexUtils.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

error HttpError(HttpErrorItem[] errors); // 0xca7a4e75

struct HttpErrorItem {
    uint16 status;
    string message;
}

struct MulticallData {
    bytes name;
    bytes[] data;
    string[] gateways;
    bytes4 callbackFunction;
    bool isWildcard;
    address resolver;
    bytes metaData;
    bool[] failures;
}

struct MulticallChecks {
    bool isCallback;
    bool hasExtendedResolver;
}

struct OffchainLookupCallData {
    address sender;
    string[] urls;
    bytes callData;
}

struct OffchainLookupExtraData {
    bytes4 callbackFunction;
    bytes data;
}

struct Result {
    bool success;
    bytes returnData;
}

struct ReverseMetadata {
    address lookupAddr;
    string resolvedName;
    address reverseResolverAddress;
}

interface BatchGateway {
    function query(
        OffchainLookupCallData[] memory data
    ) external returns (bool[] memory failures, bytes[] memory responses);
}

/**
 * The Universal Resolver is a contract that handles the work of resolving a name entirely onchain,
 * making it possible to make a single smart contract call to resolve an ENS name.
 */
contract UniversalResolver is IUniversalResolver, ERC165, Ownable {
    using Address for address;
    using NameEncoder for string;
    using BytesUtils for bytes;
    using HexUtils for bytes;

    string[] public batchGatewayURLs;
    ENS public immutable registry;

    constructor(address _registry, string[] memory _urls) {
        registry = ENS(_registry);
        batchGatewayURLs = _urls;
    }

    function setGatewayURLs(string[] memory _urls) public onlyOwner {
        batchGatewayURLs = _urls;
    }

    /**
     * @dev Performs ENS name resolution for the supplied name and resolution data.
     * @param name The name to resolve, in normalised and DNS-encoded form.
     * @param data The resolution data, as specified in ENSIP-10.
     * @return The result of resolving the name.
     */
    function resolve(
        bytes calldata name,
        bytes memory data
    ) external view returns (bytes memory, address) {
        return
            _resolveSingle(
                name,
                data,
                batchGatewayURLs,
                this.resolveSingleCallback.selector,
                ""
            );
    }

    function resolve(
        bytes calldata name,
        bytes[] memory data
    ) external view returns (Result[] memory, address) {
        return resolve(name, data, batchGatewayURLs);
    }

    function resolve(
        bytes calldata name,
        bytes memory data,
        string[] memory gateways
    ) external view returns (bytes memory, address) {
        return
            _resolveSingle(
                name,
                data,
                gateways,
                this.resolveSingleCallback.selector,
                ""
            );
    }

    function resolve(
        bytes calldata name,
        bytes[] memory data,
        string[] memory gateways
    ) public view returns (Result[] memory, address) {
        return
            _resolve(name, data, gateways, this.resolveCallback.selector, "");
    }

    function _resolveSingle(
        bytes memory name,
        bytes memory data,
        string[] memory gateways,
        bytes4 callbackFunction,
        bytes memory metaData
    ) public view returns (bytes memory, address) {
        bytes[] memory dataArr = new bytes[](1);
        dataArr[0] = data;
        (Result[] memory results, address resolver) = _resolve(
            name,
            dataArr,
            gateways,
            callbackFunction,
            metaData
        );

        Result memory result = results[0];

        _checkResolveSingle(result);

        return (result.returnData, resolver);
    }

    function _resolve(
        bytes memory name,
        bytes[] memory data,
        string[] memory gateways,
        bytes4 callbackFunction,
        bytes memory metaData
    ) internal view returns (Result[] memory results, address resolverAddress) {
        (Resolver resolver, , uint256 finalOffset) = findResolver(name);
        resolverAddress = address(resolver);
        if (resolverAddress == address(0)) {
            revert ResolverNotFound(name);
        }

        if (!resolverAddress.isContract()) {
            revert ResolverNotContract(name, resolverAddress);
        }

        bool isWildcard = finalOffset != 0;

        results = _multicall(
            MulticallData(
                name,
                data,
                gateways,
                callbackFunction,
                isWildcard,
                resolverAddress,
                metaData,
                new bool[](data.length)
            )
        );
    }

    function reverse(
        bytes calldata lookupAddress,
        uint256 coinType
    ) external view returns (string memory, address, address) {
        return reverse(lookupAddress, coinType, batchGatewayURLs);
    }

    /**
     * @dev Performs ENS name reverse resolution for the supplied reverse name.
     * @param lookupAddress The reverse address to resolve, eg. 0xb6E040C9ECAaE172a89bD561c5F73e1C48d28cd9
     * @return The resolved name, the resolver address, and the reverse resolver address.
     */
    function reverse(
        bytes memory lookupAddress,
        uint256 coinType,
        string[] memory gateways
    ) public view returns (string memory, address, address) {
        require(coinType == 60, "reverse: expected coinType 60");
        require(lookupAddress.length == 20, "reverse: expected EVM address");
        address lookupAddr = address(bytes20(lookupAddress));
        bytes memory reverseName = abi.encodePacked(
            uint8(40),
            HexUtils.addressToHex(lookupAddr),
            "\x04addr\x07reverse\x00"
        );
        (
            bytes memory reverseResolvedData,
            address reverseResolverAddress
        ) = _resolveSingle(
                reverseName,
                abi.encodeCall(INameResolver.name, reverseName.namehash(0)),
                gateways,
                this.reverseCallback.selector,
                abi.encode(ReverseMetadata(lookupAddr, "", address(0)))
            );
        return
            getForwardDataFromReverse(
                ReverseMetadata(
                    lookupAddr,
                    abi.decode(reverseResolvedData, (string)),
                    reverseResolverAddress
                ),
                gateways
            );
    }

    function getForwardDataFromReverse(
        ReverseMetadata memory metaData,
        string[] memory gateways
    ) internal view returns (string memory, address, address) {
        if (bytes(metaData.resolvedName).length == 0) {
            return ("", address(0), metaData.reverseResolverAddress);
        }
        (bytes memory encodedName, bytes32 namehash) = metaData
            .resolvedName
            .dnsEncodeName();
        (bytes memory resolvedData, address resolverAddress) = _resolveSingle(
            encodedName,
            abi.encodeCall(IAddrResolver.addr, namehash),
            gateways,
            this.reverseCallback.selector,
            abi.encode(metaData)
        );
        address addr = abi.decode(resolvedData, (address));
        if (metaData.lookupAddr != addr) {
            revert ReverseAddressMismatch(
                metaData.resolvedName,
                abi.encodePacked(addr)
            );
        }
        return (
            metaData.resolvedName,
            resolverAddress,
            metaData.reverseResolverAddress
        );
    }

    function resolveSingleCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory, address) {
        (Result[] memory results, address resolver, , ) = _resolveCallback(
            response,
            extraData,
            this.resolveSingleCallback.selector
        );
        Result memory result = results[0];

        _checkResolveSingle(result);

        return (result.returnData, resolver);
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (Result[] memory, address) {
        (Result[] memory results, address resolver, , ) = _resolveCallback(
            response,
            extraData,
            this.resolveCallback.selector
        );
        return (results, resolver);
    }

    function reverseCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (string memory, address, address) {
        (
            Result[] memory results,
            address resolverAddress,
            string[] memory gateways,
            bytes memory encodedMetaData
        ) = _resolveCallback(
                response,
                extraData,
                this.reverseCallback.selector
            );

        Result memory result = results[0];

        _checkResolveSingle(result);

        ReverseMetadata memory metaData = abi.decode(
            encodedMetaData,
            (ReverseMetadata)
        );
        if (bytes(metaData.resolvedName).length == 0) {
            metaData.resolvedName = abi.decode(result.returnData, (string));
            metaData.reverseResolverAddress = resolverAddress;
            return getForwardDataFromReverse(metaData, gateways);
        }
        address addr = abi.decode(result.returnData, (address));
        if (metaData.lookupAddr != addr) {
            revert ReverseAddressMismatch(
                metaData.resolvedName,
                abi.encodePacked(addr)
            );
        }
        return (
            metaData.resolvedName,
            resolverAddress,
            metaData.reverseResolverAddress
        );
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _resolveCallback(
        bytes calldata response,
        bytes calldata extraData,
        bytes4 callbackFunction
    )
        internal
        view
        returns (Result[] memory, address, string[] memory, bytes memory)
    {
        MulticallData memory multicallData;
        multicallData.callbackFunction = callbackFunction;
        (bool[] memory failures, bytes[] memory responses) = abi.decode(
            response,
            (bool[], bytes[])
        );
        OffchainLookupExtraData[] memory extraDatas;
        (
            multicallData.isWildcard,
            multicallData.resolver,
            multicallData.gateways,
            multicallData.metaData,
            extraDatas
        ) = abi.decode(
            extraData,
            (bool, address, string[], bytes, OffchainLookupExtraData[])
        );
        require(responses.length <= extraDatas.length);
        multicallData.data = new bytes[](extraDatas.length);
        multicallData.failures = new bool[](extraDatas.length);
        uint256 offchainCount = 0;
        for (uint256 i = 0; i < extraDatas.length; i++) {
            if (extraDatas[i].callbackFunction == bytes4(0)) {
                // This call did not require an offchain lookup; use the previous input data.
                multicallData.data[i] = extraDatas[i].data;
            } else {
                if (failures[offchainCount]) {
                    multicallData.failures[i] = true;
                    multicallData.data[i] = responses[offchainCount];
                } else {
                    multicallData.data[i] = abi.encodeWithSelector(
                        extraDatas[i].callbackFunction,
                        responses[offchainCount],
                        extraDatas[i].data
                    );
                }
                offchainCount = offchainCount + 1;
            }
        }

        return (
            _multicall(multicallData),
            multicallData.resolver,
            multicallData.gateways,
            multicallData.metaData
        );
    }

    /**
     * @dev Makes a call to `target` with `data`. If the call reverts with an `OffchainLookup` error, wraps
     *      the error with the data necessary to continue the request where it left off.
     * @param target The address to call.
     * @param data The data to call `target` with.
     * @return offchain Whether the call reverted with an `OffchainLookup` error.
     * @return returnData If `target` did not revert, contains the return data from the call to `target`. Otherwise, contains a `OffchainLookupCallData` struct.
     * @return extraData If `target` did not revert, is empty. Otherwise, contains a `OffchainLookupExtraData` struct.
     * @return result Whether the call succeeded.
     */
    function callWithOffchainLookupPropagation(
        address target,
        bytes memory data,
        bool isSafe
    )
        internal
        view
        returns (
            bool offchain,
            bytes memory returnData,
            OffchainLookupExtraData memory extraData,
            bool result
        )
    {
        if (isSafe) {
            result = LowLevelCallUtils.functionStaticCall(target, data);
        } else {
            result = LowLevelCallUtils.functionStaticCall(target, data, 50000);
        }
        uint256 size = LowLevelCallUtils.returnDataSize();

        if (result) {
            return (
                false,
                LowLevelCallUtils.readReturnData(0, size),
                extraData,
                true
            );
        }

        // Failure
        if (size >= 4) {
            bytes memory errorId = LowLevelCallUtils.readReturnData(0, 4);
            // Offchain lookup. Decode the revert message and create our own that nests it.
            bytes memory revertData = LowLevelCallUtils.readReturnData(
                4,
                size - 4
            );
            if (bytes4(errorId) == OffchainLookup.selector) {
                (
                    address wrappedSender,
                    string[] memory wrappedUrls,
                    bytes memory wrappedCallData,
                    bytes4 wrappedCallbackFunction,
                    bytes memory wrappedExtraData
                ) = abi.decode(
                        revertData,
                        (address, string[], bytes, bytes4, bytes)
                    );
                if (wrappedSender == target) {
                    returnData = abi.encode(
                        OffchainLookupCallData(
                            wrappedSender,
                            wrappedUrls,
                            wrappedCallData
                        )
                    );
                    extraData = OffchainLookupExtraData(
                        wrappedCallbackFunction,
                        wrappedExtraData
                    );
                    return (true, returnData, extraData, false);
                }
            } else {
                returnData = bytes.concat(errorId, revertData);
                return (false, returnData, extraData, false);
            }
        }
    }

    /**
     * @dev Finds a resolver by recursively querying the registry, starting at the longest name and progressively
     *      removing labels until it finds a result.
     * @param name The name to resolve, in DNS-encoded and normalised form.
     * @return resolver The Resolver responsible for this name.
     * @return namehash The namehash of the full name.
     * @return finalOffset The offset of the first label with a resolver.
     */
    function findResolver(
        bytes memory name
    ) public view returns (Resolver, bytes32, uint256) {
        (
            address resolver,
            bytes32 namehash,
            uint256 finalOffset
        ) = findResolver(name, 0);
        return (Resolver(resolver), namehash, finalOffset);
    }

    function findResolver(
        bytes memory name,
        uint256 offset
    ) internal view returns (address, bytes32, uint256) {
        uint256 labelLength = uint256(uint8(name[offset]));
        if (labelLength == 0) {
            return (address(0), bytes32(0), offset);
        }
        uint256 nextLabel = offset + labelLength + 1;
        bytes32 labelHash;
        if (
            labelLength == 66 &&
            // 0x5b == '['
            name[offset + 1] == 0x5b &&
            // 0x5d == ']'
            name[nextLabel - 1] == 0x5d
        ) {
            // Encrypted label
            (labelHash, ) = name.hexStringToBytes32(offset + 2, offset + 66);
        } else {
            labelHash = name.keccak(offset + 1, labelLength);
        }
        (
            address parentresolver,
            bytes32 parentnode,
            uint256 parentoffset
        ) = findResolver(name, nextLabel);
        bytes32 node = keccak256(abi.encodePacked(parentnode, labelHash));
        address resolver = registry.resolver(node);
        if (resolver != address(0)) {
            return (resolver, node, offset);
        }
        return (parentresolver, node, parentoffset);
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

    function _checkSafetyAndItem(
        bytes memory name,
        bytes memory item,
        address resolver,
        MulticallChecks memory multicallChecks
    ) internal view returns (bool, bytes memory) {
        if (!multicallChecks.isCallback) {
            if (multicallChecks.hasExtendedResolver) {
                return (
                    true,
                    abi.encodeCall(IExtendedResolver.resolve, (name, item))
                );
            }
            return (_checkInterface(resolver, bytes4(item)), item);
        }
        return (true, item);
    }

    function _checkMulticall(
        MulticallData memory multicallData
    ) internal view returns (MulticallChecks memory) {
        bool isCallback = multicallData.name.length == 0;
        bool hasExtendedResolver = _checkInterface(
            multicallData.resolver,
            type(IExtendedResolver).interfaceId
        );

        if (multicallData.isWildcard && !hasExtendedResolver) {
            revert ResolverNotFound(multicallData.name);
        }

        return MulticallChecks(isCallback, hasExtendedResolver);
    }

    function _checkResolveSingle(Result memory result) internal pure {
        if (!result.success) {
            bytes memory v = result.returnData;
            if (bytes4(v) == 0xca7a4e75) {
                HttpErrorItem[] memory items = abi.decode(
                    v.substring(4, v.length - 4),
                    (HttpErrorItem[])
                );
                if (items.length == 1) {
                    revert IUniversalResolver.HttpError(
                        items[0].status,
                        items[0].message
                    );
                }
            }
            revert ResolverError(v);
        }
    }

    function _multicall(
        MulticallData memory multicallData
    ) internal view returns (Result[] memory results) {
        uint256 length = multicallData.data.length;
        uint256 offchainCount = 0;
        OffchainLookupCallData[]
            memory callDatas = new OffchainLookupCallData[](length);
        OffchainLookupExtraData[]
            memory extraDatas = new OffchainLookupExtraData[](length);
        results = new Result[](length);
        MulticallChecks memory multicallChecks = _checkMulticall(multicallData);

        for (uint256 i = 0; i < length; i++) {
            bytes memory item = multicallData.data[i];
            bool failure = multicallData.failures[i];

            if (failure) {
                results[i] = Result(false, item);
                continue;
            }

            bool isSafe = false;
            (isSafe, item) = _checkSafetyAndItem(
                multicallData.name,
                item,
                multicallData.resolver,
                multicallChecks
            );

            (
                bool offchain,
                bytes memory returnData,
                OffchainLookupExtraData memory extraData,
                bool success
            ) = callWithOffchainLookupPropagation(
                    multicallData.resolver,
                    item,
                    isSafe
                );

            if (offchain) {
                callDatas[offchainCount] = abi.decode(
                    returnData,
                    (OffchainLookupCallData)
                );
                extraDatas[i] = extraData;
                offchainCount += 1;
                continue;
            }

            if (success && multicallChecks.hasExtendedResolver) {
                // if this is a successful resolve() call, unwrap the result
                returnData = abi.decode(returnData, (bytes));
            }
            results[i] = Result(success, returnData);
            extraDatas[i].data = item;
        }

        if (offchainCount == 0) {
            return results;
        }

        // Trim callDatas if offchain data exists
        assembly {
            mstore(callDatas, offchainCount)
        }

        revert OffchainLookup(
            address(this),
            multicallData.gateways,
            abi.encodeWithSelector(BatchGateway.query.selector, callDatas),
            multicallData.callbackFunction,
            abi.encode(
                multicallData.isWildcard,
                multicallData.resolver,
                multicallData.gateways,
                multicallData.metaData,
                extraDatas
            )
        );
    }
}
