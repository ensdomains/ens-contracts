// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ResolverBase} from "../ResolverBase.sol";
import {IAddrResolver} from "./IAddrResolver.sol";
import {IAddressResolver} from "./IAddressResolver.sol";
import {ENSIP19, COIN_TYPE_ETH, EVM_BIT} from "../../utils/ENSIP19.sol";

abstract contract AddrResolver is
    IAddrResolver,
    IAddressResolver,
    ResolverBase
{
    mapping(uint64 => mapping(bytes32 => mapping(uint256 => bytes))) versionable_addresses;

    /// @notice The supplied address could not be converted to `address`.
    /// @dev Error selector: `0x8d666f60`
    error InvalidEVMAddress(bytes addressBytes);

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IAddrResolver).interfaceId ||
            interfaceID == type(IAddressResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }

    /// @notice Set `addr(60)` of the associated ENS node.
    /// @dev `address(0)` is stored as `bytes(0)`.
    /// @param node The node to update.
    /// @param _addr The address to set.
    function setAddr(
        bytes32 node,
        address _addr
    ) external virtual authorised(node) {
        setAddr(
            node,
            COIN_TYPE_ETH,
            _addr == address(0) ? new bytes(0) : abi.encodePacked(_addr)
        );
    }

    /// @notice Get `addr(60)` as `address` of the associated ENS node.
    /// @param node The node to query.
    /// @return addr_ The associated address.
    function addr(
        bytes32 node
    ) public view virtual override returns (address payable addr_) {
        addr_ = payable(address(bytes20(addr(node, COIN_TYPE_ETH))));
    }

    /// @notice Set the address for coin type of the associated ENS node.
    ///         If coin type is EVM, require exactly 0 or 20 bytes and replace empty 20 bytes with 0 bytes.
    /// @param node The node to update.
    /// @param coinType The coin type.
    /// @param addressBytes The address to set.
    function setAddr(
        bytes32 node,
        uint256 coinType,
        bytes memory addressBytes
    ) public virtual authorised(node) {
        if (addressBytes.length != 0 && ENSIP19.isEVMCoinType(coinType)) {
            if (addressBytes.length != 20) {
                revert InvalidEVMAddress(addressBytes);
            } else if (bytes20(addressBytes) == bytes20(0)) {
                addressBytes = "";
            }
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
    ///         If coin type is EVM and empty, defaults to `addr(node, EVM_BIT)`.
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
            addressBytes = addrs[EVM_BIT];
        }
    }

    /// @notice Determine if coin type of the associated ENS node has been set explicitly.
    /// @param node The node to query.
    /// @param coinType The coin type.
    /// @return has True if `setAddr(node, coinType)` has been set.
    function hasAddr(
        bytes32 node,
        uint256 coinType
    ) external view returns (bool has) {
        has =
            versionable_addresses[recordVersions[node]][node][coinType].length >
            0;
    }
}
