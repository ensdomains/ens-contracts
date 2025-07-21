//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "../utils/HexUtils.sol";
import {NameCoder} from "../utils/NameCoder.sol";

uint32 constant CHAIN_ID_ETH = 1;

uint256 constant COIN_TYPE_ETH = 60;
uint256 constant COIN_TYPE_DEFAULT = 1 << 31; // 0x8000_0000

string constant SLUG_ETH = "addr"; // <=> COIN_TYPE_ETH
string constant SLUG_DEFAULT = "default"; // <=> COIN_TYPE_DEFAULT
string constant TLD_REVERSE = "reverse";

/// @dev Library for generating reverse names according to ENSIP-19.
/// https://docs.ens.domains/ensip/19
library ENSIP19 {
    /// @dev The supplied address was `0x`.
    ///      Error selector: `0x7138356f`
    error EmptyAddress();

    /// @dev Extract Chain ID from `coinType`.
    /// @param coinType The coin type.
    /// @return The Chain ID or 0 if non-EVM Chain.
    function chainFromCoinType(
        uint256 coinType
    ) internal pure returns (uint32) {
        if (coinType == COIN_TYPE_ETH) return CHAIN_ID_ETH;
        coinType ^= COIN_TYPE_DEFAULT;
        return uint32(coinType < COIN_TYPE_DEFAULT ? coinType : 0);
    }

    /// @dev Determine if Coin Type is for an EVM address.
    /// @param coinType The coin type.
    /// @return True if coin type represents an EVM address.
    function isEVMCoinType(uint256 coinType) internal pure returns (bool) {
        return coinType == COIN_TYPE_DEFAULT || chainFromCoinType(coinType) > 0;
    }

    /// @dev Generate Reverse Name from Address + Coin Type.
    ///      Reverts `EmptyAddress` if `addressBytes` is `0x`.
    /// @param addressBytes The input address.
    /// @param coinType The coin type.
    /// @return The ENS reverse name, eg. `1234abcd.addr.reverse`.
    function reverseName(
        bytes memory addressBytes,
        uint256 coinType
    ) internal pure returns (string memory) {
        if (addressBytes.length == 0) {
            revert EmptyAddress();
        }
        return
            string(
                abi.encodePacked(
                    HexUtils.bytesToHex(addressBytes),
                    bytes1("."),
                    coinType == COIN_TYPE_ETH
                        ? SLUG_ETH
                        : coinType == COIN_TYPE_DEFAULT
                            ? SLUG_DEFAULT
                            : HexUtils.unpaddedUintToHex(coinType, true),
                    bytes1("."),
                    TLD_REVERSE
                )
            );
    }

    /// @dev Parse Reverse Name into Address + Coin Type.
    ///      Matches: `/^[0-9a-fA-F]+\.([0-9a-f]{1,64}|addr|default)\.reverse$/`.
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
        (valid, coinType) = parseNamespace(name, offset);
        if (!valid) return ("", 0); // invalid namespace
    }

    /// @dev Parse Reverse Namespace into Coin Type.
    ///      Matches: `/^([0-9a-f]{1,64}|addr|default)\.reverse$/`.
    ///      Reverts `DNSDecodingFailed`.
    /// @param name The DNS-encoded name.
    /// @param offset The offset to begin parsing.
    /// @return valid True if a valid reverse namespace.
    /// @return coinType The coin type.
    function parseNamespace(
        bytes memory name,
        uint256 offset
    ) internal pure returns (bool valid, uint256 coinType) {
        (bytes32 labelHash, uint256 offsetTLD) = NameCoder.readLabel(
            name,
            offset
        );
        if (labelHash == keccak256(bytes(SLUG_ETH))) {
            coinType = COIN_TYPE_ETH;
        } else if (labelHash == keccak256(bytes(SLUG_DEFAULT))) {
            coinType = COIN_TYPE_DEFAULT;
        } else if (labelHash == bytes32(0)) {
            return (false, 0); // no slug
        } else {
            (bytes32 word, bool validHex) = HexUtils.hexStringToBytes32(
                name,
                1 + offset,
                offsetTLD
            );
            if (!validHex) return (false, 0); // invalid coinType or too long
            coinType = uint256(word);
        }
        (labelHash, offset) = NameCoder.readLabel(name, offsetTLD);
        if (labelHash != keccak256(bytes(TLD_REVERSE))) return (false, 0); // invalid tld
        (labelHash, ) = NameCoder.readLabel(name, offset);
        if (labelHash != bytes32(0)) return (false, 0); // not tld
        valid = true;
    }
}
