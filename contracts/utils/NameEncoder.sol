// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../wrapper/BytesUtil.sol";

library NameEncoder {
    using BytesUtils for bytes;

    function encode(string memory name)
        internal
        pure
        returns (bytes memory, bytes32)
    {
        uint8 labelLength = 0;
        bytes memory bytesName = bytes(name);
        uint256 length = bytesName.length;
        bytes memory dnsName = new bytes(length + 2);
        bytes32 node = bytes32(0);
        if (length == 0) {
            dnsName[0] = bytes1(0);
            return (dnsName, node);
        }
        uint256 i = length - 1;
        while (i >= 0) {
            if (bytesName[i] == ".") {
                dnsName[i + 1] = bytes1(labelLength);
                node = keccak256(
                    abi.encodePacked(node, bytesName.keccak(i + 1, labelLength))
                );
                labelLength = 0;
            } else {
                labelLength += 1;
                dnsName[i + 1] = bytesName[i];
            }
            if (i == 0) {
                break;
            }
            i--;
        }

        node = keccak256(
            abi.encodePacked(node, bytesName.keccak(0, labelLength))
        );

        dnsName[0] = bytes1(labelLength);
        return (dnsName, node);
    }
}
