// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibABI} from "./LibABI.sol";

contract TestLibABI {
    function randomBytes(uint256 n) internal pure returns (bytes memory v) {
        v = new bytes(n);
        assembly {
            mstore(0, mload(64))
            mstore(32, n)
            let rng := keccak256(0, 64)
            for {
                let ptr := add(v, sub(32, and(n, 31)))
                let end := add(v, add(32, n))
            } lt(ptr, end) {
                ptr := add(ptr, 32)
            } {
                mstore(ptr, rng)
                rng := keccak256(ptr, 32)
            }
            mstore(v, n)
        }
    }

    function test_tryDecodeBytes() external pure {
        for (uint256 n; n < 512; ++n) {
            bytes memory v = randomBytes(n);
            (bool ok, bytes memory u) = LibABI.tryDecodeBytes(abi.encode(v));
            require(ok, "ok");
            require(keccak256(v) == keccak256(u), "same");
        }
    }

    function test_tryDecodeBytes_truncated() external pure {
		for (uint256 n; n < 512; ++n) {
			bytes memory v = abi.encode(randomBytes(n));
			for (uint256 i; i < v.length; ++i) {
				assembly {
					mstore(v, i)
				}
				(bool ok, ) = LibABI.tryDecodeBytes(v);
				require(!ok);
			}
		}
    }
}
