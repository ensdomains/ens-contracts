//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {INameWrapper, PARENT_CANNOT_CONTROL} from "../wrapper/INameWrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {BaseSubdomainRegistrar, DataMissing, Unavailable, NameNotRegistered} from "./BaseSubdomainRegistrar.sol";
import {IRentalSubdomainRegistrar} from "./IRentalSubdomainRegistrar.sol";

struct Name {
    uint256 registrationFee; // per second
    address token; // ERC20 token
    address beneficiary;
    bool active;
}

error DurationTooLong(bytes32 node);
error ParentNameNotSetup(bytes32 parentNode);

contract RentalSubdomainRegistrar is
    BaseSubdomainRegistrar,
    ERC1155Holder,
    IRentalSubdomainRegistrar
{
    mapping(bytes32 => Name) public names;

    constructor(address wrapper) BaseSubdomainRegistrar(wrapper) {}

    function setupDomain(
        bytes32 node,
        address token,
        uint256 fee,
        address beneficiary,
        bool active
    ) public onlyOwner(node) {
        names[node] = Name({
            registrationFee: fee,
            token: token,
            beneficiary: beneficiary,
            active: active
        });
    }

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

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint16 fuses,
        uint64 duration,
        bytes[] calldata records
    ) public payable {
        if (!names[parentNode].active) {
            revert ParentNameNotSetup(parentNode);
        }
        uint256 fee = duration * names[parentNode].registrationFee;

        _checkParent(parentNode, duration);

        if (fee > 0) {
            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        _register(
            parentNode,
            label,
            newOwner,
            resolver,
            fuses,
            uint64(block.timestamp) + duration,
            records
        );
    }

    function renew(
        bytes32 parentNode,
        bytes32 labelhash,
        uint64 duration
    ) external payable returns (uint64 newExpiry) {
        _checkParent(parentNode, duration);

        uint256 fee = duration * names[parentNode].registrationFee;

        if (fee > 0) {
            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        return _renew(parentNode, labelhash, duration);
    }

    function batchRegister(
        bytes32 parentNode,
        string[] calldata labels,
        address[] calldata addresses,
        address resolver,
        uint16 fuses,
        uint64 duration,
        bytes[][] calldata records
    ) public {
        if (
            labels.length != addresses.length || labels.length != records.length
        ) {
            revert DataMissing();
        }

        _checkParent(parentNode, duration);

        uint256 fee = duration *
            names[parentNode].registrationFee *
            labels.length;

        if (fee > 0) {
            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        for (uint256 i = 0; i < labels.length; i++) {
            _register(
                parentNode,
                labels[i],
                addresses[i],
                resolver,
                fuses,
                uint64(block.timestamp) + duration,
                records[i]
            );
        }
    }

    function batchRenew(
        bytes32 parentNode,
        bytes32[] calldata labelhashes,
        uint64 duration
    ) external payable {
        if (labelhashes.length == 0) {
            revert DataMissing();
        }

        _checkParent(parentNode, duration);

        uint256 fee = duration *
            names[parentNode].registrationFee *
            labelhashes.length;

        if (fee > 0) {
            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        // TODO: Should we add a check to return the new expiry?
        for (uint256 i = 0; i < labelhashes.length; i++) {
            _renew(parentNode, labelhashes[i], duration);
        }
    }

    /* Internal Functions */

    function _renew(
        bytes32 parentNode,
        bytes32 labelhash,
        uint64 duration
    ) internal returns (uint64 newExpiry) {
        bytes32 node = _makeNode(parentNode, labelhash);
        (, , uint64 expiry) = wrapper.getData(uint256(node));
        if (expiry < block.timestamp) {
            revert NameNotRegistered();
        }

        newExpiry = expiry += duration;

        wrapper.setChildFuses(parentNode, labelhash, 0, newExpiry);

        emit NameRenewed(node, newExpiry);
    }

    function _checkParent(bytes32 parentNode, uint64 duration) internal view {
        (, uint64 parentExpiry) = super._checkParent(parentNode);

        if (duration + block.timestamp > parentExpiry) {
            revert DurationTooLong(parentNode);
        }
    }

    function _makeNode(
        bytes32 node,
        bytes32 labelhash
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(node, labelhash));
    }
}
