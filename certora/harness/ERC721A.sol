// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ERC721A is ERC721 {
    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_){}
}