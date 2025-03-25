// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../../resolvers/profiles/IExtendedDNSResolver.sol";
import "../../resolvers/profiles/IAddressResolver.sol";
import "../../resolvers/profiles/IAddrResolver.sol";
import "../../resolvers/profiles/ITextResolver.sol";
import "../../utils/HexUtils.sol";
import "../../utils/BytesUtils.sol";

/// @dev Resolves names on ENS by interpreting record data stored in a DNS TXT record.
///      This resolver implements the IExtendedDNSResolver interface, meaning that when
///      a DNS name specifies it as the resolver via a TXT record, this resolver's
///      resolve() method is invoked, and is passed any additional information from that
///      text record. This resolver implements a simple text parser allowing a variety
///      of records to be specified in text, which will then be used to resolve the name
///      in ENS.
///
///      To use this, set a TXT record on your DNS name in the following format:
///          ENS1 <address or name of ExtendedDNSResolver> <record data>
///
///      For example:
///          ENS1 2.dnsname.ens.eth a[60]=0x1234...
///
///      The record data consists of a series of key=value pairs, separated by spaces. Keys
///      may have an optional argument in square brackets, and values may be either unquoted
///       - in which case they may not contain spaces - or single-quoted. Single quotes in
///      a quoted value may be backslash-escaped.
///
///
///                                       ┌────────┐
///                                       │ ┌───┐  │
///        ┌──────────────────────────────┴─┤" "│◄─┴────────────────────────────────────────┐
///        │                                └───┘                                           │
///        │  ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌───┐    ┌────────────┐    ┌───┐ │
///      ^─┴─►│key├─┬─►│"["├───►│arg├───►│"]"├─┬─►│"="├─┬─►│"'"├───►│quoted_value├───►│"'"├─┼─$
///           └───┘ │  └───┘    └───┘    └───┘ │  └───┘ │  └───┘    └────────────┘    └───┘ │
///                 └──────────────────────────┘        │          ┌──────────────┐         │
///                                                     └─────────►│unquoted_value├─────────┘
///                                                                └──────────────┘
///
///      Record types:
///       - a[<coinType>] - Specifies how an `addr()` request should be resolved for the specified
///         `coinType`. Ethereum has `coinType` 60. The value must be 0x-prefixed hexadecimal, and will
///         be returned unmodified; this means that non-EVM addresses will need to be translated
///         into binary format and then encoded in hex.
///         Examples:
///          - a[60]=0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7
///          - a[0]=0x00149010587f8364b964fcaa70687216b53bd2cbd798
///       - a[e<chainId>] - Specifies how an `addr()` request should be resolved for the specified
///         `chainId`. The value must be 0x-prefixed hexadecimal. When encoding an address for an
///         EVM-based cryptocurrency that uses a chainId instead of a coinType, this syntax *must*
///         be used in place of the coin type - eg, Optimism is `a[e10]`, not `a[2147483658]`.
///         A list of supported cryptocurrencies for both syntaxes can be found here:
///           https://github.com/ensdomains/address-encoder/blob/master/docs/supported-cryptocurrencies.md
///         Example:
///          - a[e10]=0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7
///       - t[<key>] - Specifies how a `text()` request should be resolved for the specified `key`.
///         Examples:
///          - t[com.twitter]=nicksdjohnson
///          - t[url]='https://ens.domains/'
///          - t[note]='I\'m great'
contract ExtendedDNSResolver is IExtendedDNSResolver, IERC165 {
    using HexUtils for *;
    using BytesUtils for *;
    using Strings for *;

    uint256 private constant COIN_TYPE_ETH = 60;

    error NotImplemented();
    error InvalidAddressFormat(bytes addr);

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
            return _resolveAddr(context);
        } else if (selector == IAddressResolver.addr.selector) {
            return _resolveAddress(data, context);
        } else if (selector == ITextResolver.text.selector) {
            return _resolveText(data, context);
        }
        revert NotImplemented();
    }

    function _resolveAddress(
        bytes calldata data,
        bytes calldata context
    ) internal pure returns (bytes memory) {
        (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
        bytes memory value;
        // Per https://docs.ens.domains/ensip/11#specification
        if (coinType & 0x80000000 != 0) {
            value = _findValue(
                context,
                bytes.concat(
                    "a[e",
                    bytes((coinType & 0x7fffffff).toString()),
                    "]="
                )
            );
        } else {
            value = _findValue(
                context,
                bytes.concat("a[", bytes(coinType.toString()), "]=")
            );
        }
        if (value.length == 0) {
            return value;
        }
        (address record, bool valid) = value.hexToAddress(2, value.length);
        if (!valid) revert InvalidAddressFormat(value);
        return abi.encode(record);
    }

    function _resolveAddr(
        bytes calldata context
    ) internal pure returns (bytes memory) {
        bytes memory value = _findValue(context, "a[60]=");
        if (value.length == 0) {
            return value;
        }
        (address record, bool valid) = value.hexToAddress(2, value.length);
        if (!valid) revert InvalidAddressFormat(value);
        return abi.encode(record);
    }

    function _resolveText(
        bytes calldata data,
        bytes calldata context
    ) internal pure returns (bytes memory) {
        (, string memory key) = abi.decode(data[4:], (bytes32, string));
        bytes memory value = _findValue(
            context,
            bytes.concat("t[", bytes(key), "]=")
        );
        return abi.encode(value);
    }

    uint256 constant STATE_START = 0;
    uint256 constant STATE_IGNORED_KEY = 1;
    uint256 constant STATE_IGNORED_KEY_ARG = 2;
    uint256 constant STATE_VALUE = 3;
    uint256 constant STATE_QUOTED_VALUE = 4;
    uint256 constant STATE_UNQUOTED_VALUE = 5;
    uint256 constant STATE_IGNORED_VALUE = 6;
    uint256 constant STATE_IGNORED_QUOTED_VALUE = 7;
    uint256 constant STATE_IGNORED_UNQUOTED_VALUE = 8;

    /// @dev Implements a DFA to parse the text record, looking for an entry
    ///      matching `key`.
    /// @param data The text record to parse.
    /// @param key The exact key to search for.
    /// @return value The value if found, or an empty string if `key` does not exist.
    function _findValue(
        bytes memory data,
        bytes memory key
    ) internal pure returns (bytes memory value) {
        // Here we use a simple state machine to parse the text record. We
        // process characters one at a time; each character can trigger a
        // transition to a new state, or terminate the DFA and return a value.
        // For states that expect to process a number of tokens, we use
        // inner loops for efficiency reasons, to avoid the need to go
        // through the outer loop and switch statement for every character.
        uint256 state = STATE_START;
        uint256 len = data.length;
        for (uint256 i = 0; i < len; ) {
            if (state == STATE_START) {
                // Look for a matching key.
                if (data.equals(i, key, 0, key.length)) {
                    i += key.length;
                    state = STATE_VALUE;
                } else {
                    state = STATE_IGNORED_KEY;
                }
            } else if (state == STATE_IGNORED_KEY) {
                for (; i < len; i++) {
                    if (data[i] == "=") {
                        state = STATE_IGNORED_VALUE;
                        i += 1;
                        break;
                    } else if (data[i] == "[") {
                        state = STATE_IGNORED_KEY_ARG;
                        i += 1;
                        break;
                    }
                }
            } else if (state == STATE_IGNORED_KEY_ARG) {
                for (; i < len; i++) {
                    if (data[i] == "]") {
                        state = STATE_IGNORED_VALUE;
                        i += 1;
                        if (data[i] == "=") {
                            i += 1;
                        }
                        break;
                    }
                }
            } else if (state == STATE_VALUE) {
                if (data[i] == "'") {
                    state = STATE_QUOTED_VALUE;
                    i += 1;
                } else {
                    state = STATE_UNQUOTED_VALUE;
                }
            } else if (state == STATE_QUOTED_VALUE) {
                uint256 start = i;
                uint256 valueLen = 0;
                bool escaped = false;
                for (; i < len; i++) {
                    if (escaped) {
                        data[start + valueLen] = data[i];
                        valueLen += 1;
                        escaped = false;
                    } else {
                        if (data[i] == "\\") {
                            escaped = true;
                        } else if (data[i] == "'") {
                            return data.substring(start, valueLen);
                        } else {
                            data[start + valueLen] = data[i];
                            valueLen += 1;
                        }
                    }
                }
            } else if (state == STATE_UNQUOTED_VALUE) {
                uint256 start = i;
                for (; i < len; i++) {
                    if (data[i] == " ") {
                        return data.substring(start, i - start);
                    }
                }
                return data.substring(start, len - start);
            } else if (state == STATE_IGNORED_VALUE) {
                if (data[i] == "'") {
                    state = STATE_IGNORED_QUOTED_VALUE;
                    i += 1;
                } else {
                    state = STATE_IGNORED_UNQUOTED_VALUE;
                }
            } else if (state == STATE_IGNORED_QUOTED_VALUE) {
                bool escaped = false;
                for (; i < len; i++) {
                    if (escaped) {
                        escaped = false;
                    } else {
                        if (data[i] == "\\") {
                            escaped = true;
                        } else if (data[i] == "'") {
                            i += 1;
                            while (data[i] == " ") {
                                i += 1;
                            }
                            state = STATE_START;
                            break;
                        }
                    }
                }
            } else {
                assert(state == STATE_IGNORED_UNQUOTED_VALUE);
                for (; i < len; i++) {
                    if (data[i] == " ") {
                        while (data[i] == " ") {
                            i += 1;
                        }
                        state = STATE_START;
                        break;
                    }
                }
            }
        }
        return "";
    }
}
