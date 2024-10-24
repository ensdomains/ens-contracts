//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IETHRegistrarController} from "../IETHRegistrarController.sol";
import {IBaseRegistrar} from "../IBaseRegistrar.sol";

import {FixedItemPriceBulkRenewal} from "./FixedItemPriceBulkRenewal.sol";
import {FixedDurationBulkRenewal} from "./FixedDurationBulkRenewal.sol";
import {TargetExpiryBulkRenewal} from "./TargetExpiryBulkRenewal.sol";
import {BulkRenewalBase} from "./BulkRenewalBase.sol";

contract BulkRenewal is
    BulkRenewalBase,
    FixedItemPriceBulkRenewal,
    FixedDurationBulkRenewal,
    TargetExpiryBulkRenewal
{
    constructor(
        IBaseRegistrar _base,
        IETHRegistrarController _controller
    ) BulkRenewalBase(_base, _controller) {}

    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        override(
            ERC165,
            FixedItemPriceBulkRenewal,
            FixedDurationBulkRenewal,
            TargetExpiryBulkRenewal
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceID);
    }
}
