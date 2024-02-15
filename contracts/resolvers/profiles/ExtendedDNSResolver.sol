// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../../resolvers/profiles/IExtendedDNSResolver.sol";
import "../../resolvers/profiles/IAddressResolver.sol";
import "../../resolvers/profiles/IAddrResolver.sol";
import "../../utils/HexUtils.sol";

contract ExtendedDNSResolver is IExtendedDNSResolver, IERC165 {
    using HexUtils for *;

    uint256 private constant COIN_TYPE_ETH = 60;

    error NotImplemented();
    error InvalidAddressFormat();

    function supportsInterface(
        bytes4 interfaceId
    ) external view virtual override returns (bool) {
        return interfaceId == type(IExtendedDNSResolver).interfaceId;
    }

    function resolve(
        bytes calldata /* name */,
        bytes calldata data,
        bytes calldata context
    ) external pure override returns (bytes memory) {
        bytes4 selector = bytes4(data);
        if (selector == IAddrResolver.addr.selector) {
            return _resolveAddr(data, context);
        } else if (selector == IAddressResolver.addr.selector) {
            return _resolveAddress(data, context);
        }
        revert NotImplemented();
    }

    function _resolveAddress(
        bytes calldata data,
        bytes calldata context
    ) internal pure returns (bytes memory) {
        (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
        (address record, bool valid) = context.hexToAddress(2, context.length);
        if (!valid) revert InvalidAddressFormat();
        return abi.encode(record);
    }

    function _resolveAddr(
        bytes calldata data,
        bytes calldata context
    ) internal pure returns (bytes memory) {
        return _resolveAddress(data, context);
    }
}
