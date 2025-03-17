// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBatchGateway {
    struct Request {
        address sender;
        string[] urls;
        bytes data;
    }

    function query(
        Request[] memory
    ) external view returns (bool[] memory failures, bytes[] memory responses);
}
