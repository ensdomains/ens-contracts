pragma solidity >=0.8.4;

interface IDefaultReverseResolver {
    event NameChanged(bytes32 indexed node, string name);
    event TextChanged(
        bytes32 indexed node,
        string indexed indexedKey,
        string key,
        string value
    );

    function name(address addr) external view returns (string memory);

    function text(
        address addr,
        string memory key
    ) external view returns (string memory);
}
