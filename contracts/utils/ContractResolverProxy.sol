// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {UniversalResolverNoMulticall} from "./UniversalResolverNoMulticall.sol";
import {IAddrResolver} from "../resolvers/Resolver.sol";
import {BytesUtils} from "../wrapper/BytesUtils.sol";

error AddressNotFound();

contract ContractResolverProxy is ERC165 {
    using BytesUtils for bytes;

    UniversalResolverNoMulticall public immutable ur;

    constructor(address _ur) {
        ur = UniversalResolverNoMulticall(_ur);
    }

    function resolve(
        bytes calldata name,
        bytes memory data
    ) external view returns (bytes memory) {
        bytes32 namehash = name.namehash(0);
        (bytes memory resolvedAddressData, ) = ur.resolve(
            name,
            abi.encodeCall(IAddrResolver.addr, namehash)
        );
        if (resolvedAddressData.length == 0) {
            revert AddressNotFound();
        }

        address addr = abi.decode(resolvedAddressData, (address));
        if (addr == address(0)) {
            revert AddressNotFound();
        }

        (bool success, bytes memory ret) = addr.staticcall(data);
        if (!success) {
            assembly {
                revert(add(ret, 32), returndatasize())
            }
        }

        return ret;
    }
}
