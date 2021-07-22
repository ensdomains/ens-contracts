pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/StorageSlot.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/proxy/Proxy.sol";

bytes32 constant IMPLEMENTATION_SLOT = bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
bytes32 constant PROXY_CODEHASH = keccak256(abi.encodePacked(type(PersonalProxy).creationCode));

library ProxyStorage {
    event Upgraded(address indexed implementation);

    function _getImplementation() internal view returns (address) {
        return StorageSlot.getAddressSlot(IMPLEMENTATION_SLOT).value;
    }    

    function _setImplementation(address implementation) internal {
        require(Address.isContract(implementation), "New implementation is not a contract");
        StorageSlot.getAddressSlot(IMPLEMENTATION_SLOT).value = implementation;
        emit Upgraded(implementation);
    }

    function addressForOwner(address factory, address owner) internal pure returns(address ret) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            factory,
            bytes32(uint256(uint160(owner))),
            PROXY_CODEHASH
        )))));
    }
}

contract PersonalProxy is Proxy {
    constructor() { }

    function initialize(address implementation) external {
        require(ProxyStorage._getImplementation() == address(0), "Contract already initialized");
        ProxyStorage._setImplementation(implementation);
    }

    function _implementation() internal view override returns (address) {
        return ProxyStorage._getImplementation();
    }
}
