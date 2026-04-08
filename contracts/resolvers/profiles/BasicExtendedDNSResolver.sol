// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {
    IExtendedDNSResolver
} from "../../resolvers/profiles/IExtendedDNSResolver.sol";
import {IAddressResolver} from "../../resolvers/profiles/IAddressResolver.sol";
import {IAddrResolver} from "../../resolvers/profiles/IAddrResolver.sol";
import {HexUtils} from "../../utils/HexUtils.sol";
import {COIN_TYPE_ETH} from "../../utils/ENSIP19.sol";

/// @notice An IExtendedDNSResolver that parses a single address from DNS TXT records and implements IAddrResolver.
///
/// DNS TXT record format: `ENS1 dnsname.ens.eth <address>`
/// (where "dnsname.ens.eth" resolves to this contract.)
///
/// Supported resolver profiles:
/// * `IAddrResolver`
/// * `IAddressResolver` but returns null for every coin type except 60.
///
/// `name` and `node` are ignored.
///
contract BasicExtendedDNSResolver is ERC165, IExtendedDNSResolver {
    /// @dev Error selector: `0x7b1c461b`
    error UnsupportedResolverProfile(bytes4 selector);

    /// @dev Error selector: `0xc9e47ee5`
    error InvalidAddressFormat();

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExtendedDNSResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IExtendedDNSResolver
    function resolve(
        bytes calldata /* name */,
        bytes calldata data,
        bytes calldata context
    ) external pure override returns (bytes memory) {
        bytes4 selector = bytes4(data);
        if (selector == IAddrResolver.addr.selector) {
            return abi.encode(_parseAddressFromContext(context));
        } else if (selector == IAddressResolver.addr.selector) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            return
                abi.encode(
                    coinType == COIN_TYPE_ETH
                        ? abi.encodePacked(_parseAddressFromContext(context))
                        : bytes("")
                );
        } else {
            revert UnsupportedResolverProfile(selector);
        }
    }

    /// @dev Parse `"0x{address}"` into `address`.
    function _parseAddressFromContext(
        bytes calldata context
    ) internal pure returns (address) {
        if (bytes2(context) == "0x") {
            (address addr, bool ok) = HexUtils.hexToAddress(
                context,
                2,
                context.length
            );
            if (ok) return addr;
        }
        revert InvalidAddressFormat();
    }
}
