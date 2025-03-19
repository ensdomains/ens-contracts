//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "../utils/HexUtils.sol";

uint256 constant COIN_TYPE_ETH = 60;
uint256 constant EVM_BIT = 1 << 31;

/// @dev Library for generating reverse names according to ENSIP-19.
/// https://docs.ens.domains/ensip/19
library ENSIP19 {
    /// @dev The supplied address was `0x`.
    error EmptyAddress();

    /// @dev Extract Chain ID from `coinType`.
    /// @param coinType The coin type.
    /// @return chain The Chain ID or 0 if non-EVM Chain.
    function chainFromCoinType(
        uint256 coinType
    ) internal pure returns (uint32 chain) {
        if (coinType == COIN_TYPE_ETH) return 1;
        return
            uint32(
                uint32(coinType) == coinType && (coinType & EVM_BIT) != 0
                    ? coinType ^ EVM_BIT
                    : 0
            );
    }

    /// @dev Same as `reverseName()` but uses EVM Address + Chain ID.
    function reverseName(
        address addr,
        uint64 chain
    ) internal pure returns (string memory) {
        return
            reverseName(
                abi.encodePacked(addr),
                chain == 1 ? COIN_TYPE_ETH : chain | EVM_BIT
            );
    }

    /// @dev Generate Reverse Name from Encoded Address + Coin Type.
    ///      Reverts `EmptyAddress` if `encodedAddress` is `0x`.
    /// @param encodedAddress The input address.
    /// @param coinType The coin type.
    /// @return name The ENS reverse name, eg. `1234abcd.addr.reverse`.
    function reverseName(
        bytes memory encodedAddress,
        uint256 coinType
    ) internal pure returns (string memory name) {
        if (encodedAddress.length == 0) revert EmptyAddress();
        name = string(
            abi.encodePacked(
                HexUtils.bytesToHex(encodedAddress),
                ".",
                coinType == COIN_TYPE_ETH
                    ? "addr"
                    : coinType == EVM_BIT
                        ? "default"
                        : HexUtils.unpaddedUintToHex(coinType, true),
                ".reverse"
            )
        );
    }
}
