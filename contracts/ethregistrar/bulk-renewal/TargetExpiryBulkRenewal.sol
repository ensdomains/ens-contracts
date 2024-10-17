//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IPriceOracle} from "../IPriceOracle.sol";

import {ITargetExpiryBulkRenewal} from "./ITargetExpiryBulkRenewal.sol";
import {BulkRenewalBase, NameHasPremium} from "./BulkRenewalBase.sol";

error NameBeyondWantedExpiryDate(string name);

abstract contract TargetExpiryBulkRenewal is
    ITargetExpiryBulkRenewal,
    BulkRenewalBase
{
    function getTargetExpiryPriceData(
        string[] calldata names,
        uint256 targetExpiry
    )
        external
        view
        returns (
            uint256 total,
            uint256[] memory durations,
            uint256[] memory prices
        )
    {
        uint256 length = names.length;
        durations = new uint256[](length);
        prices = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            string memory name = names[i];
            uint256 expiry = base.nameExpires(uint256(keccak256(bytes(name))));
            if (expiry > targetExpiry) revert NameBeyondWantedExpiryDate(name);

            durations[i] = targetExpiry - expiry;

            IPriceOracle.Price memory price = controller.rentPrice(
                name,
                durations[i]
            );

            if (price.premium > 0) revert NameHasPremium(name);

            total += price.base;
            prices[i] = price.base;
        }
    }

    function renewAllWithTargetExpiry(
        string[] calldata names,
        uint256[] calldata durations,
        uint256[] calldata prices
    ) external payable {
        uint256 length = names.length;
        for (uint256 i = 0; i < length; ) {
            string memory name = names[i];
            uint256 duration = durations[i];
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
            interfaceID == type(ITargetExpiryBulkRenewal).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
