//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IPriceOracle} from "../IPriceOracle.sol";

import {IFixedItemPriceBulkRenewal} from "./IFixedItemPriceBulkRenewal.sol";
import {BulkRenewalBase, NameHasPremium} from "./BulkRenewalBase.sol";

error NameMismatchedPrice(string name);

abstract contract FixedItemPriceBulkRenewal is
    IFixedItemPriceBulkRenewal,
    BulkRenewalBase
{
    function getFixedItemPricePriceData(
        string[] calldata names,
        uint256 duration
    ) external view returns (uint256 total, uint256 itemPrice) {
        uint256 length = names.length;
        for (uint256 i = 0; i < length; i++) {
            string memory name = names[i];
            IPriceOracle.Price memory price = controller.rentPrice(
                name,
                duration
            );

            if (price.premium > 0) revert NameHasPremium(name);

            total += price.base;

            if (itemPrice == 0) itemPrice = price.base;
            else if (itemPrice != price.base) revert NameMismatchedPrice(name);
        }
    }

    function renewAllWithFixedItemPrice(
        string[] calldata names,
        uint256 duration,
        uint256 itemPrice
    ) external payable {
        uint256 length = names.length;
        for (uint256 i = 0; i < length; ) {
            string memory name = names[i];
            controller.renew{value: itemPrice}(name, duration);
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
            interfaceID == type(IFixedItemPriceBulkRenewal).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
