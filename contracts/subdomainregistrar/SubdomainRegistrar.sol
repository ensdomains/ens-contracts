//SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "../wrapper/INameWrapper.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import { ERC1155Holder } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "hardhat/console.sol";

error Unavailable();
error Unauthorised(bytes32 node);
error NotEnoughEther();
error NameNotRegistered();

contract SubdomainRegistrar is ERC1155Holder {
    INameWrapper public immutable wrapper;
    using Address for address;

    mapping(bytes32 => uint256) public registrationFees;
    mapping(bytes32 => address) public beneficiaries;
    mapping(bytes32 => uint256) public expiries;

    event NameRenewed(bytes32 node, uint256 duration);

    constructor(INameWrapper _wrapper) {
        wrapper = _wrapper;
    }

    modifier onlyOwner(bytes32 node) {
        if (!wrapper.isTokenOwnerOrApproved(node, msg.sender)) {
            revert Unauthorised(node);
        }
        _;
    }

    function setupDomain(bytes32 node, uint256 fee, address beneficiary) public onlyOwner(node) {
        setRegistrationFee(node, fee);
        beneficiaries[node] = beneficiary;
    }

    function setRegistrationFee(bytes32 node, uint256 fee)
        public
        onlyOwner(node)
    {
        registrationFees[node] = fee;
    }

    function available(bytes32 node) public view returns (bool) {
        return expiries[node] < block.timestamp;
    }

    function registerSubname(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint64 ttl,
        uint96 _fuses,
        uint256 duration,
        bytes[] calldata records
    ) public payable {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelhash));
        uint256 registrationFee = duration * registrationFees[parentNode];

        if (!available(node)) {
            revert Unavailable();
        }
        if (msg.value < registrationFee) {
            revert NotEnoughEther();
        }

        if(records.length > 0){
            wrapper.setSubnodeOwner(parentNode, label, address(this), 0);
            _setRecords(node, resolver, records);
        }

        wrapper.setSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            ttl,
            _fuses | PARENT_CANNOT_CONTROL // burn the ability for the parent to control
        );
        
        expiries[node] = block.timestamp + duration;

        (bool sent, ) = beneficiaries[parentNode].call{value: registrationFee}("");

        if (!sent) {
            revert();
        }
    }

    function renew(bytes32 id, uint duration) external returns(uint) {
        if(expiries[id] < block.timestamp) {
            revert NameNotRegistered();
        }
        require(expiries[id] + duration > duration); // Prevent future overflow

        expiries[id] += duration;
        emit NameRenewed(id, expiries[id]);
        return expiries[id];
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
}
