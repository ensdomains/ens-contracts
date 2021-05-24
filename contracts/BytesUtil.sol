pragma solidity >=0.8.4;

library BytesUtils {
    /*
     * @dev Returns the 96-bit number at the specified index of self.
     * @param self The byte string.
     * @param idx The index into the bytes
     * @return The specified 96 bits of the string, interpreted as an integer.
     */

    function readUint96(bytes memory self, uint256 idx)
        internal
        pure
        returns (uint96 ret)
    {
        require(idx + 12 <= self.length);
        assembly {
            ret := and(
                mload(add(add(self, 12), idx)),
                0xFFFFFFFFFFFFFFFFFFFFFFFF
            )
        }
    }
}
