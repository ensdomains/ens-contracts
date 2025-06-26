// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {StringUtils} from "../../contracts/utils/StringUtils.sol";

library TestStringUtils {
    function escape(string memory s) external pure returns (string memory) {
        return StringUtils.escape(s);
    }
    
    function strlen(string memory s) external pure returns (uint256) {
        return StringUtils.strlen(s);
    }
}
