// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../registry/ENS.sol";
import "../resolvers/profiles/IExtendedResolver.sol";
import "../resolvers/Resolver.sol";

error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

/**
 * The Universal Resolver is a contract that handles the work of resolving a name entirely onchain,
 * making it possible to make a single smart contract call to resolve an ENS name. 
 */
contract UniversalResolver is IExtendedResolver, ERC165 {
    using Address for address;

    ENS public immutable registry;

    constructor(address _registry) {
        registry = ENS(_registry);
    }

    function resolve(bytes calldata name, bytes memory data) external override view returns(bytes memory) {
        Resolver resolver = findResolver(name);
        if(address(resolver) == address(0)) {
            return "";
        }

        if(resolver.supportsInterface(type(IExtendedResolver).interfaceId)) {
            return callWithOffchainLookupPropagation(
                address(resolver),
                abi.encodeWithSelector(IExtendedResolver.resolve.selector, name, data),
                UniversalResolver.resolveCallback.selector
            );
        } else {
            return callWithOffchainLookupPropagation(
                address(resolver),
                data,
                UniversalResolver.resolveCallback.selector
            );
        }
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns(bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || super.supportsInterface(interfaceId);
    }

    function callWithOffchainLookupPropagation(address target, bytes memory data, bytes4 callbackFunction) internal view returns(bytes memory ret) {
        uint256 result;
        uint256 size;
        
        assembly {
            result := staticcall(gas(), target, add(data, 32), mload(data), 0, 0)
            size := returndatasize()
        }

        if(result == 1) {
            // Success
            ret = new bytes(size);
            assembly {
                returndatacopy(add(ret, 32), 0, size)
            }
            return ret;
        }

        // Failure
        if(size >= 4) {
            bytes4 errorId;
            assembly {
                returndatacopy(0, 0, 4)
                errorId := mload(0)
            }
            if(errorId == OffchainLookup.selector) {
                // Offchain lookup. Decode the revert message and create our own that nests it.
                bytes memory revertData = new bytes(size);
                assembly {
                    returndatacopy(add(revertData, 32), 4, sub(size, 4))
                }
                (address sender, string[] memory urls, bytes memory callData, bytes4 innerCallbackFunction, bytes memory extraData) = abi.decode(revertData, (address,string[],bytes,bytes4,bytes));
                if(sender == target) {
                    revert OffchainLookup(address(this), urls, callData, callbackFunction, abi.encode(sender, innerCallbackFunction, extraData));
                }
            }
        }

        assembly {
            returndatacopy(0, 0, size)
            revert(0, size)
        }
    }

    function resolveCallback(bytes calldata response, bytes calldata extraData) external view returns(bytes memory) {
        (address target, bytes4 innerCallbackFunction, bytes memory innerExtraData) = abi.decode(extraData, (address, bytes4, bytes));
        return abi.decode(target.functionStaticCall(abi.encodeWithSelector(innerCallbackFunction, response, innerExtraData)), (bytes));
    }

    /**
     * @dev Finds a resolver by recursively querying the registry, starting at the longest name and progressively
     *      removing labels until it finds a result.
     * @return The Resolver responsible for this name, and the namehash of the full name.
     */
    function findResolver(bytes calldata name) public view returns(Resolver) {
        (address resolver,) = findResolver(name, 0);
        return Resolver(resolver);
    }

    function findResolver(bytes calldata name, uint256 offset) internal view returns(address, bytes32) {
        uint256 labelLength = uint256(uint8(name[offset]));
        if(labelLength == 0) {
            return (address(0), bytes32(0));
        }
        uint256 nextLabel = offset + labelLength + 1;
        bytes32 labelHash = keccak256(name[offset + 1: nextLabel]);
        (address parentresolver, bytes32 parentnode) = findResolver(name, nextLabel);
        bytes32 node = keccak256(abi.encodePacked(parentnode, labelHash));
        address resolver = registry.resolver(node);
        if(resolver != address(0)) {
            return (resolver, node);
        }
        return (parentresolver, node);
    }
}
