//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HexUtils} from "../utils/HexUtils.sol";

/**
 * @notice An encrypted label matches /^\[[0-9a-f]{64}\]$/i
 *         eg. [af2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc] = "vitalik"
 */

library BytesUtilsEncrypted {
    /**
     * @dev Same as BytesUtils.readLabel() but supports encrypted labels
     */
    function readLabel(
        bytes memory self,
        uint256 idx
    ) internal pure returns (bytes32 labelHash, uint256 newIdx) {
        require(idx < self.length, "readLabel: expected length");
        uint256 len = uint256(uint8(self[idx++]));
        newIdx = idx + len;
        require(newIdx <= self.length, "readLabel: expected label");
        if (len == 66 && self[idx] == "[" && self[newIdx - 1] == "]") {
            bool valid;
            (labelHash, valid) = HexUtils.hexStringToBytes32(
                self,
                idx + 1,
                newIdx - 1
            );
            require(valid, "readLabel: Malformed encrypted label");
        } else if (len > 0) {
            assembly {
                labelHash := keccak256(add(add(self, idx), 32), len)
            }
        }
    }

    /**
     * @dev Same as BytesUtils.namehash() but supports encrypted labels
     */
    function namehash(
        bytes memory self,
        uint256 offset
    ) internal pure returns (bytes32 labelHash) {
        (labelHash, offset) = readLabel(self, offset);
        if (labelHash == bytes32(0)) {
            require(offset == self.length, "namehash: Junk at end of name");
        } else {
            bytes32 parentNode = namehash(self, offset);
            assembly {
                mstore(0, parentNode)
                mstore(32, labelHash)
                labelHash := keccak256(0, 64)
            }
        }
    }
}
