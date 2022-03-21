pragma solidity ^0.8.4;

import "./Strings.sol";

library NameEncoder {
    using strings for *;

    function encodePart(strings.slice memory name)
        internal
        view
        returns (bytes memory)
    {
        bytes memory encodedName;
        strings.slice memory label = name.split(".".toSlice());
        if (label.empty()) {
            return abi.encodePacked(uint8(0));
        }
        encodedName = encodePart(name);

        return
            abi.encodePacked(
                uint8(label.len()),
                bytes(label.toString()),
                encodedName
            );
    }

    function encode(string memory name) internal view returns (bytes memory) {
        strings.slice memory sliceName = name.toSlice();
        return encodePart(sliceName);
    }
}
