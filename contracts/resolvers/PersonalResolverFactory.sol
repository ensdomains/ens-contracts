pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/Address.sol";
import "./PersonalProxy.sol";

contract PersonalResolverFactory {
    event ProxyCreated(address indexed owner, address proxy);

    constructor() {}

    function create(address implementation) public returns(PersonalProxy ret) {
        ret = new PersonalProxy{salt: bytes32(uint256(uint160(msg.sender)))}();
        ret.initialize(implementation);
    }

    function get(address owner) public view returns(PersonalProxy ret) {
        return PersonalProxy(payable(ProxyStorage.addressForOwner(address(this), owner)));
    }

    function getOrCreate(address implementation) external returns(PersonalProxy ret) {
        ret = get(msg.sender);
        if(address(ret) == address(0)) {
            ret = create(implementation);
        }
    }
}
