pragma solidity >=0.8.4;

interface IDefaultReverseResolver {
    function name(address addr) external view returns (string memory);

    function text(
        address addr,
        string memory key
    ) external view returns (string memory);
}
