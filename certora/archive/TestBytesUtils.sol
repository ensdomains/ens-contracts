//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "../../contracts/wrapper/BytesUtils.sol";

error LabelTooShort();
error LabelTooLong(string label);

contract TestBytesUtilsCertora {
    using BytesUtils for *;
    mapping(uint256 => bytes) names;

    function setNameAtIndex(string memory label, uint256 idx) public 
    {
        names[idx] = _addLabel(label, "\x00");
    }

    function readLabel(uint256 index, uint256 offset)
        public view returns (bytes32, uint256)
    {
        bytes memory name = names[index];
        return name.readLabel(offset);
    }

    function readLabelTwoWords(bytes32 word1, bytes32 word2, uint256 offset)
        public pure returns (bytes32, uint256)
    {
        bytes memory name = abi.encodePacked(uint8(64), word1, word2, uint8(0));
        return name.readLabel(offset);
    }

    function namehash(uint256 index, uint256 offset)
        public view returns (bytes32)
    {
        bytes memory name = names[index];
        return name.namehash(offset);
    }

    function namehashTwoWords(bytes32 word1, bytes32 word2, uint256 offset)
        public pure returns (bytes32)
    {
        bytes memory name = abi.encodePacked(uint8(64), word1, word2, uint8(0));
        return name.namehash(offset);
    }

    function _addLabel(string memory label, bytes memory name)
        internal pure returns (bytes memory ret)
    {
        if (bytes(label).length < 1) {
            revert LabelTooShort();
        }
        if (bytes(label).length > 255) {
            revert LabelTooLong(label);
        }
        return abi.encodePacked(uint8(bytes(label).length), label, name);
    }
}
