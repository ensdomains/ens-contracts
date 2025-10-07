//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

library LibMem {
    /// @dev Copy `mem[src:src+len]` to `mem[dst:dst+len]`.
    ///      Equivalent to `mcopy()`.
    ///
    /// @param src The source memory offset.
    /// @param dst The destination memory offset.
    /// @param len The number of bytes to copy.
    function copy(uint256 dst, uint256 src, uint256 len) internal pure {
        assembly ("memory-safe") {
            // Copy word-length chunks while possible
            // prettier-ignore
            for {} gt(len, 31) {} {
                mstore(dst, mload(src))
                dst := add(dst, 32)
                src := add(src, 32)
                len := sub(len, 32)
            }
            // Copy remaining bytes
            if len {
                let mask := sub(shl(shl(3, sub(32, len)), 1), 1)
                let wSrc := and(mload(src), not(mask))
                let wDst := and(mload(dst), mask)
                mstore(dst, or(wSrc, wDst))
            }
        }
    }

    /// @dev Convert bytes to a memory offset.
    ///
    /// @param v The bytes to convert.
    ///
    /// @return ret The corresponding memory offset.
    function ptr(bytes memory v) internal pure returns (uint256 ret) {
        assembly ("memory-safe") {
            ret := add(v, 32)
        }
    }
    
    /// @dev Read word at memory offset.
    ///
    /// @param src The memory offset.
    ///
    /// @return ret The read word.
    function load(uint256 src) internal pure returns (uint256 ret) {
        assembly ("memory-safe") {
            ret := mload(src)
        }
    }
}
