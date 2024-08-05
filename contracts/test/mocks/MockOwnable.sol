//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

contract MockOwnable {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }
}
