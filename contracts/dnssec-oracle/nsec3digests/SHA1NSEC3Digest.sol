pragma solidity ^0.8.4;

import "./NSEC3Digest.sol";
import "../SHA1.sol";
import "@ensdomains/buffer/contracts/Buffer.sol";
/**
* @dev Implements the DNSSEC iterated SHA1 digest used for NSEC3 records.
*/
contract SHA1NSEC3Digest is NSEC3Digest {
    using Buffer for Buffer.buffer;

    function hash(bytes calldata salt, bytes calldata data, uint iterations) external override pure returns (bytes32) {
        Buffer.buffer memory buf;
        buf.init(salt.length + data.length + 16);

        buf.append(data);
        buf.append(salt);
        bytes20 h = SHA1.sha1(buf.buf);
        if (iterations > 0) {
            buf.truncate();
            buf.appendBytes20(bytes20(0));
            buf.append(salt);

            for (uint i = 0; i < iterations; i++) {
                buf.writeBytes20(0, h);
                h = SHA1.sha1(buf.buf);
            }
        }

        return bytes32(h);
    }
}
