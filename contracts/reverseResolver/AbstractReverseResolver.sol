// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {
    ERC165
} from "@openzeppelin/contracts-v5/utils/introspection/ERC165.sol";
import {IExtendedResolver} from "../resolvers/profiles/IExtendedResolver.sol";
import {IAddressResolver} from "../resolvers/profiles/IAddressResolver.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {INameReverser} from "./INameReverser.sol";
import {IERC7996} from "../utils/IERC7996.sol";
import {ENSIP19, COIN_TYPE_DEFAULT, COIN_TYPE_ETH} from "../utils/ENSIP19.sol";

abstract contract AbstractReverseResolver is
    IExtendedResolver,
    INameReverser,
    IERC7996,
    ERC165
{
    /// @inheritdoc INameReverser
    uint256 public immutable coinType;

    /// @inheritdoc INameReverser
    address public immutable chainRegistrar;

    /// @notice `resolve()` was called with a profile other than `name()` or `addr(*)`.
    /// @dev Error selector: `0x7b1c461b`
    error UnsupportedResolverProfile(bytes4 selector);

    /// @notice `name` is not a valid DNS-encoded ENSIP-19 reverse name or namespace.
    /// @dev Error selector: `0x5fe9a5df`
    error UnreachableName(bytes name);

    constructor(uint256 _coinType, address registrar) {
        coinType = _coinType;
        chainRegistrar = registrar;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            interfaceId == type(INameReverser).interfaceId ||
            interfaceId == type(IERC7996).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IERC7996
    function supportsFeature(bytes4) external pure returns (bool) {
        return false;
    }

    /// @inheritdoc INameReverser
    function chainId() external view returns (uint32) {
        return ENSIP19.chainFromCoinType(coinType);
    }

    /// @dev Resolve one address to a name.
    ///      If this reverts `OffchainLookup`, it must return an abi-encoded result since
    ///      it is invoked during `resolve()`.
    function _resolveName(
        address addr
    ) internal view virtual returns (string memory name);

    /// @notice Resolves the following profiles according to ENSIP-10:
    ///         - `name()` if `name` is an ENSIP-19 reverse name of an EVM address for `coinType`.
    ///         - `addr(*) = registrar` if `name` is an ENSIP-19 reverse namespace for `coinType`.
    ///         Caller should enable EIP-3668.
    /// @dev This function may execute over multiple steps.
    /// @param name The reverse name to resolve, in normalised and DNS-encoded form.
    /// @param data The resolution data, as specified in ENSIP-10.
    /// @return result The encoded response for the requested profile.
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view returns (bytes memory result) {
        bytes4 selector = bytes4(data);
        if (selector == INameResolver.name.selector) {
            (bytes memory a, uint256 ct) = ENSIP19.parse(name);
            if (
                a.length != 20 ||
                !(
                    coinType == COIN_TYPE_DEFAULT
                        ? ENSIP19.isEVMCoinType(ct)
                        : ct == coinType
                )
            ) {
                revert UnreachableName(name);
            }
            address addr = address(bytes20(a));
            return abi.encode(_resolveName(addr));
        } else if (selector == IAddrResolver.addr.selector) {
            (bool valid, ) = ENSIP19.parseNamespace(name, 0);
            if (!valid) revert UnreachableName(name);
            return
                abi.encode(
                    coinType == COIN_TYPE_ETH ? chainRegistrar : address(0)
                );
        } else if (selector == IAddressResolver.addr.selector) {
            (bool valid, ) = ENSIP19.parseNamespace(name, 0);
            if (!valid) revert UnreachableName(name);
            (, uint256 ct) = abi.decode(data[4:], (bytes32, uint256));
            return
                abi.encode(
                    coinType == ct
                        ? abi.encodePacked(chainRegistrar)
                        : new bytes(0)
                );
        } else {
            revert UnsupportedResolverProfile(selector);
        }
    }

    // `INameReverser.resolveNames()` is not implemented here because it causes
    // an incorrect "Unreachable code" compiler warning if `_resolveName()` reverts.
    // https://github.com/ethereum/solidity/issues/15426#issuecomment-2917868211
    //
    // /// @inheritdoc INameReverser
    // function resolveNames(
    //     address[] memory addrs,
    //     uint8 /*perPage*/
    // ) external view returns (string[] memory names) {
    //     names = new string[](addrs.length);
    //     for (uint256 i; i < addrs.length; i++) {
    //         names[i] = _resolveName(addrs[i]);
    //     }
    // }
}
