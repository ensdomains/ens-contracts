//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IPriceOracle} from "../IPriceOracle.sol";

import {IFixedDurationBulkRenewal} from "./IFixedDurationBulkRenewal.sol";
import {BulkRenewalBase, NameAvailable} from "./BulkRenewalBase.sol";

abstract contract FixedDurationBulkRenewal is
    IFixedDurationBulkRenewal,
    BulkRenewalBase
{
    function getFixedDurationPriceData(
        string[] calldata names,
        uint256 duration
    ) external view returns (uint256 total, uint256[] memory prices) {
        uint256 length = names.length;
        prices = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            string memory name = names[i];
            if (controller.available(name)) revert NameAvailable(name);
            IPriceOracle.Price memory price = controller.rentPrice(
                name,
                duration
            );

            total += price.base;
            prices[i] = price.base;
        }
    }

    function renewAllWithFixedDuration(
        string[] calldata names,
        uint256 duration,
        uint256[] calldata prices
    ) external payable {
        uint256 length = names.length;
        for (uint256 i = 0; i < length; ) {
            string memory name = names[i];
            uint256 value = prices[i];
            controller.renew{value: value}(name, duration);
            unchecked {
                ++i;
            }
        }
        // Send any excess funds back
        payable(msg.sender).transfer(address(this).balance);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IFixedDurationBulkRenewal).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
