pragma solidity >=0.8.4;

interface IMetaDataService {
    function uri(uint256) external view returns (string memory);
}
