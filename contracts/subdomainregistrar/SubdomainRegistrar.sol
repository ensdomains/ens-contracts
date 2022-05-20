//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../wrapper/INameWrapper.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract SubdomainRegistrar {
    INameWrapper public immutable wrapper;
    using Address for address;

    constructor(INameWrapper _wrapper) {
        wrapper = _wrapper;
    }

    function registerSubname(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint64 ttl,
        uint96 _fuses,
        bytes[] calldata records
    ) public {
        wrapper.setSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            ttl,
            _fuses | PARENT_CANNOT_CONTROL // burn the ability for the parent to control
        );
        bytes32 labelhash = keccak256(bytes(label));
        _setRecords(resolver, parentNode, labelhash, records);
    }

    function _setRecords(
        address resolver,
        bytes32 parentNode,
        bytes32 label,
        bytes[] calldata records
    ) internal {
        bytes32 nodehash = keccak256(abi.encodePacked(parentNode, label));
        for (uint256 i = 0; i < records.length; i++) {
            // check first few bytes are namehash
            bytes32 txNamehash = bytes32(records[i][4:36]);
            require(
                txNamehash == nodehash,
                "SubdomainRegistrar: Namehash on record do not match the name being registered"
            );
            resolver.functionCall(
                records[i],
                "SubdomainRegistrar: Failed to set Record"
            );
        }
    }
}
