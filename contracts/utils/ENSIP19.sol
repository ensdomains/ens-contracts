//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "../utils/HexUtils.sol";
import {NameCoder} from "../utils/NameCoder.sol";

uint32 constant CHAIN_ID_ETH = 1;
uint256 constant COIN_TYPE_ETH = 60;
uint256 constant EVM_BIT = 1 << 31;

string constant SLUG_ETH = "addr"; // <=> COIN_TYPE_ETH
string constant SLUG_DEFAULT = "default"; // <=> EVM_BIT
string constant TLD_REVERSE = "reverse";

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
        if (coinType == COIN_TYPE_ETH) return CHAIN_ID_ETH;
        return
            uint32(
                uint32(coinType) == coinType && (coinType & EVM_BIT) != 0
                    ? coinType ^ EVM_BIT
                    : 0
            );
    }

    /// @dev Determine if Coin Type is for an EVM address.
    /// @param coinType The coin type.
    /// @return isEVM True if coin type represents an EVM address.
    function isEVMCoinType(
        uint256 coinType
    ) internal pure returns (bool isEVM) {
        isEVM = chainFromCoinType(coinType) != 0 || coinType == EVM_BIT;
    }

    /// @dev Generate Reverse Name from Address + Coin Type.
    ///      Reverts `EmptyAddress` if `addressBytes` is `0x`.
    /// @param addressBytes The input address.
    /// @param coinType The coin type.
    /// @return name The ENS reverse name, eg. `1234abcd.addr.reverse`.
    function reverseName(
        bytes memory addressBytes,
        uint256 coinType
    ) internal pure returns (string memory name) {
        if (addressBytes.length == 0) revert EmptyAddress();
        name = string(
            abi.encodePacked(
                HexUtils.bytesToHex(addressBytes),
                bytes1("."),
                coinType == COIN_TYPE_ETH
                    ? SLUG_ETH
                    : coinType == EVM_BIT
                        ? SLUG_DEFAULT
                        : HexUtils.unpaddedUintToHex(coinType, true),
                bytes1("."),
                TLD_REVERSE
            )
        );
    }

    /// @dev Parse Reverse Name into Address + Coin Type.
    ///      Matches: /^[0-9a-fA-F]+\.([0-9a-f]{1,64}|addr|default)\.reverse$/.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @return addressBytes The address or empty if invalid.
    /// @return coinType The coin type.
    function parse(
        bytes memory name
    ) internal pure returns (bytes memory addressBytes, uint256 coinType) {
        (, uint256 offset) = NameCoder.readLabel(name, 0);
        bool valid;
        (addressBytes, valid) = HexUtils.hexToBytes(name, 1, offset);
        if (!valid || addressBytes.length == 0) return ("", 0); // addressBytes not 1+ hex
        (bytes32 labelHash, uint256 offset2) = NameCoder.readLabel(
            name,
            offset
        );
        if (labelHash == keccak256(bytes(SLUG_ETH))) {
            coinType = COIN_TYPE_ETH;
        } else if (labelHash == keccak256(bytes(SLUG_DEFAULT))) {
            coinType = EVM_BIT;
        } else if (labelHash == bytes32(0)) {
            return ("", 0); // no slug
        } else {
            bytes32 word;
            (word, valid) = HexUtils.hexStringToBytes32(
                name,
                1 + offset,
                offset2
            );
            if (!valid) return ("", 0); // invalid coinType
            coinType = uint256(word);
        }
        (labelHash, offset) = NameCoder.readLabel(name, offset2);
        if (labelHash != keccak256(bytes(TLD_REVERSE))) return ("", 0); // invalid tld
        (labelHash, ) = NameCoder.readLabel(name, offset);
        if (labelHash != bytes32(0)) return ("", 0); // not tld
    }
}
