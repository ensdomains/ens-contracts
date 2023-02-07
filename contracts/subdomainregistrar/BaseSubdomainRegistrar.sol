//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {INameWrapper, PARENT_CANNOT_CONTROL, IS_DOT_ETH} from "../wrapper/INameWrapper.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

error Unavailable();
error Unauthorised(bytes32 node);
error InsufficientFunds();
error NameNotRegistered();
error InvalidTokenAddress(address);
error NameNotSetup(bytes32 node);
error DataMissing();
error ParentExpired(bytes32 node);
error ParentNotWrapped(bytes32 node);
error DurationTooLong(bytes32 node);

abstract contract BaseSubdomainRegistrar {
    INameWrapper public immutable wrapper;
    using Address for address;

    event NameRegistered(bytes32 node, uint256 expiry);
    event NameRenewed(bytes32 node, uint256 expiry);
    uint64 private GRACE_PERIOD = 90 days;

    constructor(address _wrapper) {
        wrapper = INameWrapper(_wrapper);
    }

    modifier onlyOwner(bytes32 node) {
        if (!wrapper.canModifyName(node, msg.sender)) {
            revert Unauthorised(node);
        }
        _;
    }
    modifier canBeRegistered(bytes32 parentNode, uint64 duration) {
        _checkParent(parentNode);
        _;
    }

    function available(bytes32 node) public returns (bool) {
        try wrapper.getData(uint256(node)) returns (
            address,
            uint32,
            uint64 expiry
        ) {
            return expiry < block.timestamp;
        } catch {
            return true;
        }
    }

    /* Internal Functions */

    function _register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint32 fuses,
        uint64 duration,
        bytes[] calldata records
    ) internal {
        bytes32 node = keccak256(
            abi.encodePacked(parentNode, keccak256(bytes(label)))
        );

        if (!available(node)) {
            revert Unavailable();
        }

        if (records.length > 0) {
            wrapper.setSubnodeOwner(
                parentNode,
                label,
                address(this),
                0,
                uint64(block.timestamp + duration)
            );
            _setRecords(node, resolver, records);
        }

        wrapper.setSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            0,
            fuses | PARENT_CANNOT_CONTROL, // burn the ability for the parent to control
            uint64(block.timestamp + duration)
        );

        emit NameRegistered(node, uint64(block.timestamp + duration));
    }

    function _setRecords(
        bytes32 node,
        address resolver,
        bytes[] calldata records
    ) internal {
        for (uint256 i = 0; i < records.length; i++) {
            // check first few bytes are namehash
            bytes32 txNamehash = bytes32(records[i][4:36]);
            require(
                txNamehash == node,
                "SubdomainRegistrar: Namehash on record do not match the name being registered"
            );
            resolver.functionCall(
                records[i],
                "SubdomainRegistrar: Failed to set Record"
            );
        }
    }

    function _checkParent(bytes32 node) internal returns (uint32, uint64) {
        try wrapper.getData(uint256(node)) returns (
            address,
            uint32 fuses,
            uint64 expiry
        ) {
            if (fuses & IS_DOT_ETH == IS_DOT_ETH) {
                expiry = expiry - GRACE_PERIOD;
            }

            if (block.timestamp > expiry) {
                revert ParentExpired(node);
            }
            return (fuses, expiry);
        } catch {
            revert ParentNotWrapped(node);
        }
    }
}
