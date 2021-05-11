pragma solidity ^0.5.0;

import "@ensdomains/ens/contracts/ENSRegistry.sol";

contract DummyDNSSEC {

    struct Data {
        uint32 inception;
        uint64 inserted;
        bytes20 hash;
    }

    mapping (bytes32 => Data) private datas;

    function setData(uint16 _expectedType, bytes memory _expectedName, uint32 _inception, uint64 _inserted, bytes memory _proof) public {
        Data storage rr = datas[keccak256(abi.encodePacked(_expectedType, _expectedName))];
        rr.inception = _inception;
        rr.inserted = _inserted;

        if (_proof.length != 0) {
            rr.hash = bytes20(keccak256(_proof));
        } else {
            rr.hash = bytes20(0);
        }
    }

    function rrdata(uint16 dnstype, bytes memory name) public view returns (uint32, uint64, bytes20) {
        Data storage rr = datas[keccak256(abi.encodePacked(dnstype, name))];
        return (rr.inception, rr.inserted, rr.hash);
    }
}
