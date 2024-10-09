// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (utils/Strings.sol)

pragma solidity ^0.8.0;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @dev String operations.
 */
library PrefixlessHexStrings {
    bytes16 private constant _SYMBOLS = "0123456789abcdef";

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation.
     */
    function toHexString(uint256 value) internal pure returns (bytes memory) {
        unchecked {
            return toHexString(value, Math.log256(value) + 1);
        }
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation with fixed length.
     */
    function toHexString(
        uint256 value,
        uint256 length
    ) internal pure returns (bytes memory) {
        bytes memory buffer = new bytes(2 * length);
        for (uint256 i = 2 * length; i > 0; --i) {
            buffer[i - 1] = _SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return buffer;
    }

    /**
     * @dev Converts arbitrary bytes to its ASCII `string` hexadecimal representation.
     */
    function toHexString(
        bytes memory input
    ) internal view returns (bytes memory) {
        bytes memory buffer = new bytes(input.length * 2);
        for (uint256 i = input.length; i > 0; --i) {
            uint8 value = uint8(input[i - 1]);
            buffer[i * 2 - 2] = _SYMBOLS[value >> 4];
            buffer[i * 2 - 1] = _SYMBOLS[value & 0xf];
        }
        return buffer;
    }
}
