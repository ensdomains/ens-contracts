// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../dnssec-oracle/BytesUtils.sol";

library RecordParser {
    using BytesUtils for bytes;

    function readToken(bytes memory data, uint256 idx, uint256 len) internal pure returns(bytes memory key, bytes memory value, uint256 newidx) {
        while(idx < len && data[idx] == " ") {
            idx++;
        }

        uint256 separator = data.find(idx, len, "=");
        if(separator == type(uint256).max) {
            return ("", "", type(uint256).max);
        }

        uint256 end = data.find(separator, len - (separator - idx), " ");
        if(end == type(uint256).max) {
            end = idx + len;
        }

        return (data.substring(idx, separator - idx), data.substring(separator + 1, len - (separator - idx) - 1), end);
    }
}
