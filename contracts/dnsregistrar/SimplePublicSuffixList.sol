pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "../root/Ownable.sol";
import "./PublicSuffixList.sol";

contract SimplePublicSuffixList is PublicSuffixList, Ownable {
    mapping(bytes => bool) suffixes;

    event SuffixAdded(bytes suffix);

    function addPublicSuffixes(bytes[] memory names) public onlyOwner {
        for (uint256 i = 0; i < names.length; i++) {
            suffixes[names[i]] = true;
            emit SuffixAdded(names[i]);
        }
    }

    function isPublicSuffix(
        bytes calldata name
    ) external view override returns (bool) {
        return suffixes[name];
    }
}
