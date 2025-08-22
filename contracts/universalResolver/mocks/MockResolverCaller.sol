// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {CCIPReader} from "../../ccipRead/CCIPReader.sol";
import {ResolverCaller} from "../ResolverCaller.sol";
import {IExtendedResolver} from "../../resolvers/profiles/IExtendedResolver.sol";

contract MockResolverCaller is ResolverCaller {
    constructor() CCIPReader(0) {}
}
