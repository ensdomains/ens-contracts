// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Address.sol";

library LowLevelCallUtils {
    using Address for address;

    function functionStaticCall(address target, bytes memory data) internal view returns(bool success) {
        require(target.isContract(), "LowLevelCallUtils: static call to non-contract");
        assembly {
            success := staticcall(gas(), target, add(data, 32), mload(data), 0, 0)
        }
    }

    function returnDataSize() internal pure returns(uint256 len) {
        assembly {
            len := returndatasize()
        }
    }

    function readReturnData(uint256 offset, uint256 length) internal pure returns(bytes memory data) {
        data = new bytes(length);
        assembly {
            returndatacopy(add(data, 32), offset, length)
        }
    }

    function propagateRevert() internal pure {
        assembly {
            returndatacopy(0, 0, returndatasize())
            revert(0, returndatasize())
        }
    }
}
