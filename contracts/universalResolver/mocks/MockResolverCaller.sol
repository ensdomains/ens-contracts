// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CCIPReader} from "../../ccipRead/CCIPReader.sol";
import {ResolverCaller} from "../ResolverCaller.sol";

contract MockResolverCaller is ResolverCaller {
    constructor() CCIPReader(0) {}
}
