pragma solidity ^0.8.4;

interface PublicSuffixList {
    function isPublicSuffix(bytes calldata name) external view returns(bool);
}
