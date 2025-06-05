// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {ResolverBase, IERC165} from "../ResolverBase.sol";
import {IAddrResolver} from "./IAddrResolver.sol";
import {IAddressResolver} from "./IAddressResolver.sol";
import {IHasAddressResolver} from "./IHasAddressResolver.sol";
import {ENSIP19, COIN_TYPE_ETH, COIN_TYPE_DEFAULT} from "../../utils/ENSIP19.sol";

abstract contract AddrResolver is
    IAddrResolver,
    IAddressResolver,
    IHasAddressResolver,
    ResolverBase
{
    mapping(uint64 => mapping(bytes32 => mapping(uint256 => bytes))) versionable_addresses;

    /// @notice The supplied address could not be converted to `address`.
    /// @dev Error selector: `0x8d666f60`
    error InvalidEVMAddress(bytes addressBytes);

    /// @notice Set `addr(60)` of the associated ENS node.
    ///         `address(0)` is stored as `new bytes(20)`.
    /// @param node The node to update.
    /// @param _addr The address to set.
    function setAddr(
        bytes32 node,
        address _addr
    ) external virtual authorised(node) {
        setAddr(node, COIN_TYPE_ETH, abi.encodePacked(_addr));
    }

    /// @notice Get `addr(60)` as `address` of the associated ENS node.
    /// @param node The node to query.
    /// @return The associated address.
    function addr(
        bytes32 node
    ) public view virtual override returns (address payable) {
        return payable(address(bytes20(addr(node, COIN_TYPE_ETH))));
    }

    /// @notice Set the address for coin type of the associated ENS node.
    ///         Reverts `InvalidEVMAddress` if coin type is EVM and not 0 or 20 bytes.
    /// @param node The node to update.
    /// @param coinType The coin type.
    /// @param addressBytes The address to set.
    function setAddr(
        bytes32 node,
        uint256 coinType,
        bytes memory addressBytes
    ) public virtual authorised(node) {
        if (
            addressBytes.length != 0 &&
            addressBytes.length != 20 &&
            ENSIP19.isEVMCoinType(coinType)
        ) {
            revert InvalidEVMAddress(addressBytes);
        }
        emit AddressChanged(node, coinType, addressBytes);
        if (coinType == COIN_TYPE_ETH) {
            emit AddrChanged(node, address(bytes20(addressBytes)));
        }
        versionable_addresses[recordVersions[node]][node][
            coinType
        ] = addressBytes;
    }

    /// @notice Get the address for coin type of the associated ENS node.
    ///         If coin type is EVM and empty, defaults to `addr(COIN_TYPE_DEFAULT)`.
    /// @param node The node to query.
    /// @param coinType The coin type.
    /// @return addressBytes The assocated address.
    function addr(
        bytes32 node,
        uint256 coinType
    ) public view virtual override returns (bytes memory addressBytes) {
        mapping(uint256 => bytes) storage addrs = versionable_addresses[
            recordVersions[node]
        ][node];
        addressBytes = addrs[coinType];
        if (
            addressBytes.length == 0 && ENSIP19.chainFromCoinType(coinType) > 0
        ) {
            addressBytes = addrs[COIN_TYPE_DEFAULT];
        }
    }

    /// @inheritdoc IHasAddressResolver
    function hasAddr(
        bytes32 node,
        uint256 coinType
    ) external view returns (bool) {
        return
            versionable_addresses[recordVersions[node]][node][coinType].length >
            0;
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            type(IAddrResolver).interfaceId == interfaceId ||
            type(IAddressResolver).interfaceId == interfaceId ||
            type(IHasAddressResolver).interfaceId == interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
