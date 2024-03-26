// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../../resolvers/profiles/IExtendedDNSResolver.sol";
import "../../resolvers/profiles/IAddressResolver.sol";
import "../../resolvers/profiles/IAddrResolver.sol";
import "../../resolvers/profiles/ITextResolver.sol";
import "../../utils/HexUtils.sol";
import "../../dnssec-oracle/BytesUtils.sol";

contract DummyExtendedDNSSECResolver2 is IExtendedDNSResolver, IERC165 {
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
        (bytes memory record, bool valid) = value.hexToBytes(2, value.length);
        if (!valid) revert InvalidAddressFormat(value);
        return record;
    }

    function _resolveAddr(
        bytes calldata context
    ) internal pure returns (bytes memory) {
        bytes memory value = _findValue(context, "a[60]=");
        if (value.length == 0) {
            return value;
        }
        (bytes memory record, bool valid) = value.hexToBytes(2, value.length);
        if (!valid) revert InvalidAddressFormat(value);
        return record;
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
        return value;
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

    function _findValue(
        bytes memory data,
        bytes memory key
    ) internal pure returns (bytes memory value) {
        uint256 state = STATE_START;
        uint256 len = data.length;
        for (uint256 i = 0; i < len; ) {
            if (state == STATE_START) {
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
