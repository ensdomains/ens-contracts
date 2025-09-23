//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";
import {IETHRegistrarController} from "./IETHRegistrarController.sol";

interface IWrappedEthRegistrarController {
    function renew(string calldata name, uint256 duration) external payable;
}

interface IWrappedEthRegistrarControllerWithRenewalReferrals {
    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable;
}

contract WrappedEthRegistrarControllerWithRenewalReferrals is
    IWrappedEthRegistrarControllerWithRenewalReferrals,
    Ownable
{
    IWrappedEthRegistrarController immutable wrappedEthRegistrarController;
    IETHRegistrarController immutable unwrappedEthRegistrarController;

    constructor(
        IWrappedEthRegistrarController _wrappedEthRegistrarController,
        IETHRegistrarController _unwrappedEthRegistrarController
    ) Ownable(msg.sender) {
        wrappedEthRegistrarController = _wrappedEthRegistrarController;
        unwrappedEthRegistrarController = _unwrappedEthRegistrarController;
    }

    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable {
        // 1. renew the name in the latest EthRegistrarController, which emits referrer
        unwrappedEthRegistrarController.renew{value: msg.value}(
            label,
            duration,
            referrer
        );

        // 2. bump the WrappedEthRegistrarController so NameWrapper gets the new expiry
        wrappedEthRegistrarController.renew(label, 0);

        // 3. refund msg.sender any leftover payment
        if (address(this).balance > 0) {
            payable(msg.sender).transfer(address(this).balance);
        }
    }
}
