//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "../utils/HexUtils.sol";

uint256 constant COIN_TYPE_ETH = 60;
uint256 constant EVM_BIT = 1 << 31;

/// @dev Library for generating reverse names according to ENSIP-19
/// https://docs.ens.domains/ensip/19
library ENSIP19 {
    /// @dev Extract Chain ID from `coinType`
    ///      returns 0 for EVM_BIT and non-EVM Chain
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

    /// @dev Generate DNS-encoded Reverse Name from EVM Address + Chain ID
    function dnsReverseName(
        address addr,
        uint64 chain
    ) internal pure returns (bytes memory) {
        return
            dnsReverseName(
                abi.encodePacked(addr),
                chain == 1 ? COIN_TYPE_ETH : chain | EVM_BIT
            );
    }

    /// @dev Generate DNS-encoded Reverse Name from Encoded Address + Coin Type
    function dnsReverseName(
        bytes memory encodedAddress,
        uint256 coinType
    ) internal pure returns (bytes memory) {
        require(
            encodedAddress.length <= 128,
            "dnsReverseName: address too long"
        );
        string memory hexAddr = HexUtils.bytesToHex(encodedAddress);
        string memory hexCoin;
        if (coinType == COIN_TYPE_ETH) {
            hexCoin = "addr";
        } else if (coinType == EVM_BIT) {
            hexCoin = "default";
        } else {
            hexCoin = HexUtils.unpaddedUintToHex(coinType, true);
        }
        return
            abi.encodePacked(
                uint8(bytes(hexAddr).length),
                hexAddr,
                uint8(bytes(hexCoin).length),
                hexCoin,
                "\x07reverse\x00"
            );
    }
}
