pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "../root/Ownable.sol";
import "./PublicSuffixList.sol";

contract SimplePublicSuffixList is PublicSuffixList, Ownable {
    mapping(bytes=>bool) suffixes;

    function addPublicSuffixes(bytes[] memory names) public onlyOwner {
        for(uint i = 0; i < names.length; i++) {
            suffixes[names[i]] = true;
        }
    }

    function isPublicSuffix(bytes calldata name) external override view returns(bool) {
        return suffixes[name];
    }
}
