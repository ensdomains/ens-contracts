// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import {ENS} from "../../registry/ENS.sol";
import {ENSIP10ResolverFinder} from "../../universalResolver/ENSIP10ResolverFinder.sol";

contract DummyENSIP10ResolverFinderImplementer is ENSIP10ResolverFinder {
    constructor(ENS ensRegistry) ENSIP10ResolverFinder(ensRegistry) {}
}
