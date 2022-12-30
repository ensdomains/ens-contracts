//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

library BytesUtils {
    /*
     * @dev Returns the keccak-256 hash of a byte range.
     * @param self The byte string to hash.
     * @param offset The position to start hashing at.
     * @param len The number of bytes to hash.
     * @return The hash of the byte range.
     */
    function keccak(
        bytes memory self,
        uint256 offset,
        uint256 len
    ) internal pure returns (bytes32 ret) {
        return 0;
    }

    /**
     * @dev Returns the ENS namehash of a DNS-encoded name.
     * @param self The DNS-encoded name to hash.
     * @param offset The offset at which to start hashing.
     * @return The namehash of the name.
     */
    function namehash(bytes memory self, uint256 offset)
        internal
        pure
        returns (bytes32)
    {
        (bytes32 labelhash, uint256 newOffset) = readLabel(self, offset);
        if (labelhash == bytes32(0)) {
            require(offset == self.length - 1, "namehash: Junk at end of name");
            return bytes32(0);
        }
        return
            keccak256(abi.encodePacked(namehash(self, newOffset), labelhash));
    }

    /**
     * @dev Returns the keccak-256 hash of a DNS-encoded label, and the offset to the start of the next label.
     * @param self The byte string to read a label from.
     * @param idx The index to read a label at.
     * @return labelhash The hash of the label at the specified index, or 0 if it is the last label.
     * @return newIdx The index of the start of the next label.
     */
    function readLabel(bytes memory self, uint256 idx)
        internal
        pure
        returns (bytes32 labelhash, uint256 newIdx) {
            bytes32 word = _firstWord(self);
            uint256 len = uint256(uint8(self[0]));
            return (_readLabelHash(word, idx, len), _readLabelNewIdx(word, idx, len));
        }

    /*
    * @notice Certora helper: get the first word of bytes.   
    * @param self The byte string to read a word from.
    */ 
    function _firstWord(bytes memory self) internal pure returns(bytes32 word) {
        assembly {
            word := mload(add(self, 32))
        }
    }

    // Functions to be summarized by ghost summaries:

    function _readLabelHash(bytes32, uint256, uint256) internal pure returns (bytes32) {
        return 0;
    }

    function _readLabelNewIdx(bytes32, uint256, uint256) internal pure returns (uint256) {
        return 0;
    }
}
