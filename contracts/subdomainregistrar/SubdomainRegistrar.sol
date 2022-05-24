//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../wrapper/INameWrapper.sol";
import "@openzeppelin/contracts/utils/Address.sol";

error Unavailable();
error Unauthorised(bytes32 node);
error NotEnoughEther();

contract SubdomainRegistrar {
    INameWrapper public immutable wrapper;
    using Address for address;

    mapping(bytes32 => uint256) public registrationFees;
    mapping(bytes32 => uint256) public expiries;

    constructor(INameWrapper _wrapper) {
        wrapper = _wrapper;
    }

    modifier onlyOwner(bytes32 node) {
        if (!wrapper.isTokenOwnerOrApproved(node, msg.sender)) {
            revert Unauthorised(node);
        }
        _;
    }

    function setRegistrationFee(bytes32 node, uint256 fee)
        public
        onlyOwner(node)
    {
        registrationFee[node] = fee;
    }

    function available(bytes32 node) public view returns (bool) {
        // Not available if it's registered here or in its grace period.
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
        uint256 registrationFee = duration * registrationFees[node];
        if (!available(node)) {
            revert Unavailable();
        }
        if (msg.value < registrationFee) {
            revert NotEnoughEther();
        }

        wrapper.setSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            ttl,
            _fuses | PARENT_CANNOT_CONTROL // burn the ability for the parent to control
        );

        _setRecords(node, resolver, records);
        expiries[node] = block.timestamp + duration;

        // Transfer fees - could allow the fees to go elsewhere
        wrapper.ownerOf(node).call{value: registrationFee}("");
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
