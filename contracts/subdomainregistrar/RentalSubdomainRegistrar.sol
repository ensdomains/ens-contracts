//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {INameWrapper, PARENT_CANNOT_CONTROL} from "../wrapper/INameWrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {BaseSubdomainRegistrar, DataMissing, Unavailable, NameNotRegistered} from "./BaseSubdomainRegistrar.sol";
import {IRentalSubdomainRegistrar} from "./IRentalSubdomainRegistrar.sol";
import {ISubnamePricer} from "./subname-pricers/ISubnamePricer.sol";

error DurationTooLong(bytes32 node);

contract RentalSubdomainRegistrar is
    BaseSubdomainRegistrar,
    ERC1155Holder,
    IRentalSubdomainRegistrar
{
    constructor(address wrapper) BaseSubdomainRegistrar(wrapper) {}

    function available(
        bytes32 node
    )
        public
        view
        override(BaseSubdomainRegistrar, IRentalSubdomainRegistrar)
        returns (bool)
    {
        return super.available(node);
    }

    function renew(
        bytes32 parentNode,
        string calldata label,
        uint64 duration
    ) external payable returns (uint64 newExpiry) {
        _checkParent(parentNode, duration);

        (address token, uint256 fee) = names[parentNode].pricer.price(
            parentNode,
            label,
            duration
        );

        if (fee > 0) {
            IERC20(token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        return _renew(parentNode, label, duration);
    }

    function batchRenew(
        bytes32 parentNode,
        string[] calldata labels,
        uint64 duration
    ) external payable {
        if (labels.length == 0) {
            revert DataMissing();
        }

        _checkParent(parentNode, duration);

        // TODO: Should we add a check to return the new expiry?
        ISubnamePricer pricer = names[parentNode].pricer;
        for (uint256 i = 0; i < labels.length; i++) {
            (address token, uint256 price) = pricer.price(
                parentNode,
                labels[i],
                duration
            );

            if (price > 0) {
                IERC20(token).transferFrom(
                    msg.sender,
                    address(names[parentNode].beneficiary),
                    price
                );
            }
            _renew(parentNode, labels[i], duration);
        }
    }

    /* Internal Functions */

    function _renew(
        bytes32 parentNode,
        string calldata label,
        uint64 duration
    ) internal returns (uint64 newExpiry) {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _makeNode(parentNode, labelhash);
        (, , uint64 expiry) = wrapper.getData(uint256(node));
        if (expiry < block.timestamp) {
            revert NameNotRegistered();
        }

        newExpiry = expiry + duration;

        wrapper.setChildFuses(parentNode, labelhash, 0, newExpiry);

        emit NameRenewed(node, newExpiry);
    }

    function _makeNode(
        bytes32 node,
        bytes32 labelhash
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(node, labelhash));
    }
}
