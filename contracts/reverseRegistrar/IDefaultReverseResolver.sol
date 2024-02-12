pragma solidity >=0.8.4;

interface IDefaultReverseResolver {
    event NameChanged(bytes32 indexed node, string name);
    event TextChanged(
        bytes32 indexed node,
        string indexed indexedKey,
        string key,
        string value
    );

    function name(address addr) external returns (string memory);

    function text(
        address addr,
        string memory key
    ) external returns (string memory);

    function setNameForAddrWithSignature(
        address addr,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    ) external returns (bytes32);

    function setTextForAddrWithSignature(
        address addr,
        string calldata key,
        string calldata value,
        uint256 inceptionDate,
        bytes memory signature
    ) external returns (bytes32);

    function clearRecordsWithSignature(
        address addr,
        uint256 inceptionDate,
        bytes memory signature
    ) external;
}
