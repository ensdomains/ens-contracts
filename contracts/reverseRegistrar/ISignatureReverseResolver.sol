pragma solidity >=0.8.4;

interface ISignatureReverseResolver {
    event VersionChanged(bytes32 indexed node, uint64 newVersion);
    event ReverseClaimed(address indexed addr, bytes32 indexed node);
    event NameChanged(bytes32 indexed node, string name);
    event TextChanged(
        bytes32 indexed node,
        string indexed indexedKey,
        string key,
        string value
    );

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

    function node(address addr) external view returns (bytes32);
}
