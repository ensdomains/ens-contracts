pragma solidity ^0.8.4;

import "./Digest.sol";
import "../BytesUtils.sol";

/**
* @dev Implements the DNSSEC SHA256 digest.
*/
contract SHA256Digest is Digest {
    using BytesUtils for *;

    function verify(bytes calldata data, bytes calldata hash) external override pure returns (bool) {
        return sha256(data) == hash.readBytes32(0);
    }
}
