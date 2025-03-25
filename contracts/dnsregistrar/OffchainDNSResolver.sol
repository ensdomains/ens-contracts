// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../contracts/resolvers/profiles/IAddrResolver.sol";
import "../../contracts/resolvers/profiles/IExtendedResolver.sol";
import "../../contracts/resolvers/profiles/IExtendedDNSResolver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../dnssec-oracle/DNSSEC.sol";
import "../dnssec-oracle/RRUtils.sol";
import "../registry/ENSRegistry.sol";
import "../utils/HexUtils.sol";
import "../utils/BytesUtils.sol";

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {LowLevelCallUtils} from "../utils/LowLevelCallUtils.sol";

error InvalidOperation();
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

interface IDNSGateway {
    function resolve(
        bytes memory name,
        uint16 qtype
    ) external returns (DNSSEC.RRSetWithSignature[] memory);
}

uint16 constant CLASS_INET = 1;
uint16 constant TYPE_TXT = 16;

contract OffchainDNSResolver is IExtendedResolver, IERC165 {
    using RRUtils for *;
    using Address for address;
    using BytesUtils for bytes;
    using HexUtils for bytes;

    ENS public immutable ens;
    DNSSEC public immutable oracle;
    string public gatewayURL;

    error CouldNotResolve(bytes name);

    constructor(ENS _ens, DNSSEC _oracle, string memory _gatewayURL) {
        ens = _ens;
        oracle = _oracle;
        gatewayURL = _gatewayURL;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId;
    }

    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory) {
        revertWithDefaultOffchainLookup(name, data);
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        (bytes memory name, bytes memory query, bytes4 selector) = abi.decode(
            extraData,
            (bytes, bytes, bytes4)
        );

        if (selector != bytes4(0)) {
            (bytes memory targetData, address targetResolver) = abi.decode(
                query,
                (bytes, address)
            );
            return
                callWithOffchainLookupPropagation(
                    targetResolver,
                    name,
                    query,
                    abi.encodeWithSelector(
                        selector,
                        response,
                        abi.encode(targetData, address(this))
                    )
                );
        }

        DNSSEC.RRSetWithSignature[] memory rrsets = abi.decode(
            response,
            (DNSSEC.RRSetWithSignature[])
        );

        (bytes memory data, ) = oracle.verifyRRSet(rrsets);
        for (
            RRUtils.RRIterator memory iter = data.iterateRRs(0);
            !iter.done();
            iter.next()
        ) {
            // Ignore records with wrong name, type, or class
            bytes memory rrname = RRUtils.readName(iter.data, iter.offset);
            if (
                !rrname.equals(name) ||
                iter.class != CLASS_INET ||
                iter.dnstype != TYPE_TXT
            ) {
                continue;
            }

            // Look for a valid ENS-DNS TXT record
            (address dnsresolver, bytes memory context) = parseRR(
                iter.data,
                iter.rdataOffset,
                iter.nextOffset
            );

            // If we found a valid record, try to resolve it
            if (dnsresolver != address(0)) {
                if (
                    IERC165(dnsresolver).supportsInterface(
                        IExtendedDNSResolver.resolve.selector
                    )
                ) {
                    return
                        callWithOffchainLookupPropagation(
                            dnsresolver,
                            name,
                            query,
                            abi.encodeCall(
                                IExtendedDNSResolver.resolve,
                                (name, query, context)
                            )
                        );
                } else if (
                    IERC165(dnsresolver).supportsInterface(
                        IExtendedResolver.resolve.selector
                    )
                ) {
                    return
                        callWithOffchainLookupPropagation(
                            dnsresolver,
                            name,
                            query,
                            abi.encodeCall(
                                IExtendedResolver.resolve,
                                (name, query)
                            )
                        );
                } else {
                    (bool ok, bytes memory ret) = address(dnsresolver)
                        .staticcall(query);
                    if (ok) {
                        return ret;
                    } else {
                        revert CouldNotResolve(name);
                    }
                }
            }
        }

        // No valid records; revert.
        revert CouldNotResolve(name);
    }

    function parseRR(
        bytes memory data,
        uint256 idx,
        uint256 lastIdx
    ) internal view returns (address, bytes memory) {
        bytes memory txt = readTXT(data, idx, lastIdx);

        // Must start with the magic word
        if (txt.length < 5 || !txt.equals(0, "ENS1 ", 0, 5)) {
            return (address(0), "");
        }

        // Parse the name or address
        uint256 lastTxtIdx = txt.find(5, txt.length - 5, " ");
        if (lastTxtIdx > txt.length) {
            address dnsResolver = parseAndResolve(txt, 5, txt.length);
            return (dnsResolver, "");
        } else {
            address dnsResolver = parseAndResolve(txt, 5, lastTxtIdx);
            return (
                dnsResolver,
                txt.substring(lastTxtIdx + 1, txt.length - lastTxtIdx - 1)
            );
        }
    }

    function readTXT(
        bytes memory data,
        uint256 startIdx,
        uint256 lastIdx
    ) internal pure returns (bytes memory) {
        // TODO: Concatenate multiple text fields
        uint256 fieldLength = data.readUint8(startIdx);
        assert(startIdx + fieldLength < lastIdx);
        return data.substring(startIdx + 1, fieldLength);
    }

    function parseAndResolve(
        bytes memory nameOrAddress,
        uint256 idx,
        uint256 lastIdx
    ) internal view returns (address) {
        if (nameOrAddress[idx] == "0" && nameOrAddress[idx + 1] == "x") {
            (address ret, bool valid) = nameOrAddress.hexToAddress(
                idx + 2,
                lastIdx
            );
            if (valid) {
                return ret;
            }
        }
        return resolveName(nameOrAddress, idx, lastIdx);
    }

    function resolveName(
        bytes memory name,
        uint256 idx,
        uint256 lastIdx
    ) internal view returns (address) {
        bytes32 node = textNamehash(name, idx, lastIdx);
        address resolver = ens.resolver(node);
        if (resolver == address(0)) {
            return address(0);
        }
        return IAddrResolver(resolver).addr(node);
    }

    /// @dev Namehash function that operates on dot-separated names (not dns-encoded names)
    /// @param name Name to hash
    /// @param idx Index to start at
    /// @param lastIdx Index to end at
    function textNamehash(
        bytes memory name,
        uint256 idx,
        uint256 lastIdx
    ) internal view returns (bytes32) {
        uint256 separator = name.find(idx, name.length - idx, bytes1("."));
        bytes32 parentNode = bytes32(0);
        if (separator < lastIdx) {
            parentNode = textNamehash(name, separator + 1, lastIdx);
        } else {
            separator = lastIdx;
        }
        return
            keccak256(
                abi.encodePacked(parentNode, name.keccak(idx, separator - idx))
            );
    }

    function callWithOffchainLookupPropagation(
        address target,
        bytes memory name,
        bytes memory innerdata,
        bytes memory data
    ) internal view returns (bytes memory) {
        if (!target.isContract()) {
            revertWithDefaultOffchainLookup(name, innerdata);
        }

        bool result = LowLevelCallUtils.functionStaticCall(
            address(target),
            data
        );
        uint256 size = LowLevelCallUtils.returnDataSize();
        if (result) {
            bytes memory returnData = LowLevelCallUtils.readReturnData(0, size);
            return abi.decode(returnData, (bytes));
        }
        // Failure
        if (size >= 4) {
            bytes memory errorId = LowLevelCallUtils.readReturnData(0, 4);
            if (bytes4(errorId) == OffchainLookup.selector) {
                // Offchain lookup. Decode the revert message and create our own that nests it.
                bytes memory revertData = LowLevelCallUtils.readReturnData(
                    4,
                    size - 4
                );
                handleOffchainLookupError(revertData, target, name);
            }
        }
        LowLevelCallUtils.propagateRevert();
    }

    function revertWithDefaultOffchainLookup(
        bytes memory name,
        bytes memory data
    ) internal view {
        string[] memory urls = new string[](1);
        urls[0] = gatewayURL;

        revert OffchainLookup(
            address(this),
            urls,
            abi.encodeCall(IDNSGateway.resolve, (name, TYPE_TXT)),
            OffchainDNSResolver.resolveCallback.selector,
            abi.encode(name, data, bytes4(0))
        );
    }

    function handleOffchainLookupError(
        bytes memory returnData,
        address target,
        bytes memory name
    ) internal view {
        (
            address sender,
            string[] memory urls,
            bytes memory callData,
            bytes4 innerCallbackFunction,
            bytes memory extraData
        ) = abi.decode(returnData, (address, string[], bytes, bytes4, bytes));

        if (sender != target) {
            revert InvalidOperation();
        }

        revert OffchainLookup(
            address(this),
            urls,
            callData,
            OffchainDNSResolver.resolveCallback.selector,
            abi.encode(name, extraData, innerCallbackFunction)
        );
    }
}
