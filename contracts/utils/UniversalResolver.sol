// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./LowLevelCallUtils.sol";
import "../registry/ENS.sol";
import "../resolvers/profiles/IExtendedResolver.sol";
import "../resolvers/Resolver.sol";
import "../resolvers/profiles/INameResolver.sol";
import "./Strings.sol";
import "hardhat/console.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

/**
 * The Universal Resolver is a contract that handles the work of resolving a name entirely onchain,
 * making it possible to make a single smart contract call to resolve an ENS name.
 */
contract UniversalResolver is IExtendedResolver, ERC165 {
    using Address for address;
    using strings for *;

    ENS public immutable registry;

    constructor(address _registry) {
        registry = ENS(_registry);
    }

    function encodePart(strings.slice memory name)
        internal
        view
        returns (bytes memory)
    {
        bytes memory dnsname;
        strings.slice memory label = name.split(".".toSlice());
        if (label.empty()) {
            return abi.encodePacked(uint8(0));
        }
        dnsname = encodePart(name);

        return
            abi.encodePacked(
                uint8(label.len()),
                bytes(label.toString()),
                dnsname
            );
    }

    function encode(string memory name) public view returns (bytes memory) {
        strings.slice memory sliceName = name.toSlice();
        return encodePart(sliceName);
    }

    /**
     * @dev Performs ENS name resolution for the supplied name and resolution data.
     * @param name The name to resolve, in normalised and DNS-encoded form.
     * @param data The resolution data, as specified in ENSIP-10.
     * @return The result of resolving the name.
     */
    function resolve(bytes calldata name, bytes memory data)
        external
        view
        override
        returns (bytes memory)
    {
        (Resolver resolver, ) = findResolver(name);
        if (address(resolver) == address(0)) {
            return "";
        }

        if (resolver.supportsInterface(type(IExtendedResolver).interfaceId)) {
            return
                callWithOffchainLookupPropagation(
                    address(resolver),
                    abi.encodeWithSelector(
                        IExtendedResolver.resolve.selector,
                        name,
                        data
                    ),
                    UniversalResolver.resolveCallback.selector
                );
        } else {
            return
                callWithOffchainLookupPropagation(
                    address(resolver),
                    data,
                    UniversalResolver.resolveCallback.selector
                );
        }
    }

    function reverse(bytes calldata name) external view returns (bytes memory) {
        (Resolver resolver, bytes32 labelhash) = findResolver(name);
        if (address(resolver) == address(0)) {
            return "";
        }
        bool success = LowLevelCallUtils.functionStaticCall(
            address(resolver),
            abi.encodeWithSelector(INameResolver.name.selector, labelhash)
        );
        if (!success) {
            return "";
        }
        uint256 length = LowLevelCallUtils.returnDataSize();
        return LowLevelCallUtils.readReturnData(0, length);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev Makes a call to `target` with `data`. If the call reverts with an `OffchainLookup` error, wraps
     *      the error with the data necessary to continue the request where it left off.
     * @param target The address to call.
     * @param data The data to call `target` with.
     * @param callbackFunction The function ID of a function on this contract to use as an EIP 3668 callback.
     *        This function's `extraData` argument will be passed `(address target, bytes4 innerCallback, bytes innerExtraData)`.
     * @return ret If `target` did not revert, contains the return data from the call to `target`.
     */
    function callWithOffchainLookupPropagation(
        address target,
        bytes memory data,
        bytes4 callbackFunction
    ) internal view returns (bytes memory ret) {
        bool result = LowLevelCallUtils.functionStaticCall(target, data);
        uint256 size = LowLevelCallUtils.returnDataSize();

        if (result) {
            return LowLevelCallUtils.readReturnData(0, size);
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
                (
                    address sender,
                    string[] memory urls,
                    bytes memory callData,
                    bytes4 innerCallbackFunction,
                    bytes memory extraData
                ) = abi.decode(
                        revertData,
                        (address, string[], bytes, bytes4, bytes)
                    );
                if (sender == target) {
                    revert OffchainLookup(
                        address(this),
                        urls,
                        callData,
                        callbackFunction,
                        abi.encode(sender, innerCallbackFunction, extraData)
                    );
                }
            }
        }

        LowLevelCallUtils.propagateRevert();
    }

    /**
     * @dev Callback function for `resolve`.
     * @param response Response data returned by the target address that invoked the inner `OffchainData` revert.
     * @param extraData Extra data encoded by `callWithOffchainLookupPropagation` to allow completing the request.
     */
    function resolveCallback(bytes calldata response, bytes calldata extraData)
        external
        view
        returns (bytes memory)
    {
        (
            address target,
            bytes4 innerCallbackFunction,
            bytes memory innerExtraData
        ) = abi.decode(extraData, (address, bytes4, bytes));
        return
            abi.decode(
                target.functionStaticCall(
                    abi.encodeWithSelector(
                        innerCallbackFunction,
                        response,
                        innerExtraData
                    )
                ),
                (bytes)
            );
    }

    /**
     * @dev Finds a resolver by recursively querying the registry, starting at the longest name and progressively
     *      removing labels until it finds a result.
     * @param name The name to resolve, in DNS-encoded and normalised form.
     * @return The Resolver responsible for this name, and the namehash of the full name.
     */
    function findResolver(bytes calldata name)
        public
        view
        returns (Resolver, bytes32)
    {
        (address resolver, bytes32 labelhash) = findResolver(name, 0);
        return (Resolver(resolver), labelhash);
    }

    function findResolver(bytes calldata name, uint256 offset)
        internal
        view
        returns (address, bytes32)
    {
        uint256 labelLength = uint256(uint8(name[offset]));
        if (labelLength == 0) {
            return (address(0), bytes32(0));
        }
        uint256 nextLabel = offset + labelLength + 1;
        bytes32 labelHash = keccak256(name[offset + 1:nextLabel]);
        (address parentresolver, bytes32 parentnode) = findResolver(
            name,
            nextLabel
        );
        bytes32 node = keccak256(abi.encodePacked(parentnode, labelHash));
        address resolver = registry.resolver(node);
        if (resolver != address(0)) {
            return (resolver, node);
        }
        return (parentresolver, node);
    }
}
