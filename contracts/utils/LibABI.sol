// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {BytesUtils} from "./BytesUtils.sol";

library LibABI {
    /// @dev Safely decode abi-encoded `bytes`.
    function tryDecodeBytes(
        bytes memory v
    ) internal pure returns (bool ok, bytes memory value) {
        unchecked {
            uint256 need = 32;
            if (v.length >= need) {
                uint256 offset = uint256(bytes32(v));
                need += offset;
                if (v.length >= need) {
                    uint256 size = uint256(BytesUtils.readBytes32(v, offset));
                    if (v.length >= need + size) {
                        return (
                            true,
                            BytesUtils.substring(v, offset + 32, size)
                        );
                    }
                }
            }
        }
    }
}
