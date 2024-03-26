// SPDX-License-Identifier: MIT
import "../../../contracts/utils/StringUtils.sol";

library StringUtilsTest {
    function testEscape(
        string calldata testStr
    ) public pure returns (string memory) {
        return StringUtils.escape(testStr);
    }
}
