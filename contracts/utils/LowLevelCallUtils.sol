// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";

library LowLevelCallUtils {
    // This is the hex encoding of the string 'abcdefghijklmnopqrstuvwxyz'
    // It is used as a constant to lookup the characters of the hex address
    bytes32 constant lookup =
        0x3031323334353637383961626364656600000000000000000000000000000000;
    using Address for address;

    /**
     * @dev Makes a static call to the specified `target` with `data`. Return data can be fetched with
     *      `returnDataSize` and `readReturnData`.
     * @param target The address to staticcall.
     * @param data The data to pass to the call.
     * @return success True if the call succeeded, or false if it reverts.
     */
    function functionStaticCall(
        address target,
        bytes memory data
    ) internal view returns (bool success) {
        return functionStaticCall(target, data, gasleft());
    }

    /**
     * @dev Makes a static call to the specified `target` with `data` using `gasLimit`. Return data can be fetched with
     *      `returnDataSize` and `readReturnData`.
     * @param target The address to staticcall.
     * @param data The data to pass to the call.
     * @param gasLimit The gas limit to use for the call.
     * @return success True if the call succeeded, or false if it reverts.
     */
    function functionStaticCall(
        address target,
        bytes memory data,
        uint256 gasLimit
    ) internal view returns (bool success) {
        require(
            target.isContract(),
            "LowLevelCallUtils: static call to non-contract"
        );
        assembly {
            success := staticcall(
                gasLimit,
                target,
                add(data, 32),
                mload(data),
                0,
                0
            )
        }
    }

    /**
     * @dev Returns the size of the return data of the most recent external call.
     */
    function returnDataSize() internal pure returns (uint256 len) {
        assembly {
            len := returndatasize()
        }
    }

    /**
     * @dev Reads return data from the most recent external call.
     * @param offset Offset into the return data.
     * @param length Number of bytes to return.
     */
    function readReturnData(
        uint256 offset,
        uint256 length
    ) internal pure returns (bytes memory data) {
        data = new bytes(length);
        assembly {
            returndatacopy(add(data, 32), offset, length)
        }
    }

    /**
     * @dev Reverts with the return data from the most recent external call.
     */
    function propagateRevert() internal pure {
        assembly {
            returndatacopy(0, 0, returndatasize())
            revert(0, returndatasize())
        }
    }

    /**
     * @dev An optimised function to compute the sha3 of the lower-case
     *      hexadecimal representation of an Ethereum address.
     * @param addr The address to hash
     * @return ret The SHA3 hash of the lower-case hexadecimal encoding of the
     *         input address.
     */
    function sha3HexAddress(address addr) internal pure returns (bytes32 ret) {
        assembly {
            for {
                let i := 40
            } gt(i, 0) {

            } {
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
            }

            ret := keccak256(0, 40)
        }
    }
}
