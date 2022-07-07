//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "../wrapper/INameWrapper.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

error Unavailable();
error Unauthorised(bytes32 node);
error InsufficientFunds();
error NameNotRegistered();
error InvalidTokenAddress(address);
error NameNotSetup(bytes32 node);

struct Name {
    uint256 registrationFee; // per second
    address token; // ERC20 token
    address beneficiary;
}

contract SubdomainRegistrar is ERC1155Holder {
    INameWrapper public immutable wrapper;
    using Address for address;

    mapping(bytes32 => Name) public names;
    mapping(bytes32 => uint256) public expiries;

    event NameRegistered(bytes32 node, uint256 expiry);
    event NameRenewed(bytes32 node, uint256 expiry);

    constructor(INameWrapper _wrapper) {
        wrapper = _wrapper;
    }

    modifier onlyOwner(bytes32 node) {
        if (!wrapper.isTokenOwnerOrApproved(node, msg.sender)) {
            revert Unauthorised(node);
        }
        _;
    }

    function setupDomain(
        bytes32 node,
        address token,
        uint256 fee,
        address beneficiary
    ) public onlyOwner(node) {
        names[node].registrationFee = fee;
        names[node].token = token;
        names[node].beneficiary = beneficiary;
    }

    function available(bytes32 node) public returns (bool) {
        try wrapper.getFuses(node) returns (uint32, uint64 expiry) {
            return expiry < block.timestamp;
        } catch {
            return true;
        }
    }

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint32 fuses,
        uint64 duration,
        bytes[] calldata records
    ) public payable {
        bytes32 node = keccak256(
            abi.encodePacked(parentNode, keccak256(bytes(label)))
        );

        uint256 fee = duration * names[parentNode].registrationFee;

        if (!available(node)) {
            revert Unavailable();
        }

        if (fee > 0) {
            if (IERC20(names[parentNode].token).balanceOf(msg.sender) < fee) {
                revert InsufficientFunds();
            }

            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
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

    function renew(
        bytes32 parentNode,
        bytes32 labelhash,
        uint64 duration
    ) external payable returns (uint64 newExpiry) {
        bytes32 node = _makeNode(parentNode, labelhash);
        (, uint64 expiry) = wrapper.getFuses(node);
        if (expiry < block.timestamp) {
            revert NameNotRegistered();
        }

        uint256 fee = duration * names[parentNode].registrationFee;

        if (fee > 0) {
            IERC20(names[parentNode].token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        newExpiry = expiry += duration;

        wrapper.setChildFuses(parentNode, labelhash, 0, newExpiry);

        emit NameRenewed(node, newExpiry);
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

    function _makeNode(bytes32 node, bytes32 labelhash)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(node, labelhash));
    }
}
