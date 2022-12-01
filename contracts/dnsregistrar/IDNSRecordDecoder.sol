//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

interface IDNSRecordDecoder {
    function resolve(bytes memory name, bytes memory config, bytes memory query) external view returns(bytes memory);
}
