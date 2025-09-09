//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ReverseNamer} from "../../reverseRegistrar/ReverseNamer.sol";

contract MockReverseNamer {
    function registrarFromChain(
        uint256 chainId
    ) external pure returns (address) {
        return ReverseNamer.registrarFromChain(chainId);
    }
}

// // PoC for compile-time error if Ownable
// import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
// import {NamedOnce} from "../../reverseRegistrar/ReverseNamer.sol";
// contract MockNamedOnce is Ownable, NamedOnce("") {}
