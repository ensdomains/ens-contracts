pragma solidity ^0.8.4;

import "../../utils/BytesUtils.sol";
import "../RecordParser.sol";

contract DummyParser {
    using BytesUtils for bytes;

    // parse data in format: name;key1=value1 key2=value2;url
    function parseData(
        bytes memory data,
        uint256 kvCount
    )
        external
        pure
        returns (
            string memory name,
            string[] memory keys,
            string[] memory values,
            string memory url
        )
    {
        uint256 len = data.length;
        // retrieve name
        uint256 sep1 = data.find(0, len, ";");
        name = string(data.substring(0, sep1));

        // retrieve url
        uint256 sep2 = data.find(sep1 + 1, len - sep1, ";");
        url = string(data.substring(sep2 + 1, len - sep2 - 1));

        keys = new string[](kvCount);
        values = new string[](kvCount);
        // retrieve keys and values
        uint256 offset = sep1 + 1;
        for (uint256 i; i < kvCount && offset < len; i++) {
            (
                bytes memory key,
                bytes memory val,
                uint256 nextOffset
            ) = RecordParser.readKeyValue(data, offset, sep2 - offset);
            keys[i] = string(key);
            values[i] = string(val);
            offset = nextOffset;
        }
    }
}
