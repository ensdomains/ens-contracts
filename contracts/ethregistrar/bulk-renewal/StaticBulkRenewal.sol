//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import ".././ETHRegistrarController.sol";
import "./IStaticBulkRenewal.sol";
import ".././IPriceOracle.sol";

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract StaticBulkRenewal is IStaticBulkRenewal {
    ETHRegistrarController controller;

    constructor(ETHRegistrarController _controller) {
        controller = _controller;
    }

    function rentPrice(
        string[] calldata names,
        uint256 duration
    ) external view override returns (uint256 total) {
        uint256 length = names.length;
        for (uint256 i = 0; i < length; ) {
            IPriceOracle.Price memory price = controller.rentPrice(
                names[i],
                duration
            );
            unchecked {
                ++i;
                total += price.base;
            }
        }
    }

    function renewAll(
        string[] calldata names,
        uint256 duration
    ) external payable override {
        uint256 length = names.length;
        for (uint256 i = 0; i < length; ) {
            IPriceOracle.Price memory price = controller.rentPrice(
                names[i],
                duration
            );
            uint256 totalPrice = price.base + price.premium;
            controller.renew{value: totalPrice}(names[i], duration);
            unchecked {
                ++i;
            }
        }
        // Send any excess funds back
        payable(msg.sender).transfer(address(this).balance);
    }

    function supportsInterface(
        bytes4 interfaceID
    ) external pure returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IStaticBulkRenewal).interfaceId;
    }
}
