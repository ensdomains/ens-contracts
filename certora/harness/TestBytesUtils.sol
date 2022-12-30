//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "../../contracts/wrapper/BytesUtils.sol";

contract TestBytesUtilsCertora {
    using BytesUtils for *;
    mapping(uint256 => bytes) names;

    function readLabel(uint256 index, uint256 offset)
        public
        view
        returns (bytes32, uint256)
    {
        bytes memory name = names[index];
        return name.readLabel(offset);
    }

    function readLabelTwoWords(bytes32 word1, bytes32 word2, uint256 offset)
        public
        pure
        returns (bytes32, uint256)
    {
        bytes memory name = abi.encodePacked(word1, word2);
        return name.readLabel(offset);
    }

    function namehash(uint256 index, uint256 offset)
        public
        view
        returns (bytes32)
    {
        bytes memory name = names[index];
        return name.namehash(offset);
    }

    function namehashTwoWords(bytes32 word1, bytes32 word2, uint256 offset)
        public
        pure
        returns (bytes32)
    {
        bytes memory name = abi.encodePacked(word1, word2);
        return name.namehash(offset);
    }
}
