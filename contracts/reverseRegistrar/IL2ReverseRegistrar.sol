pragma solidity >=0.8.4;

interface IL2ReverseRegistrar {
    function setName(string memory name) external returns (bytes32);

    function setNameForAddr(
        address addr,
        string memory name
    ) external returns (bytes32);

    function setNameForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    ) external returns (bytes32);

    function setText(
        string calldata key,
        string calldata value
    ) external returns (bytes32);

    function setTextForAddr(
        address addr,
        string calldata key,
        string calldata value
    ) external returns (bytes32);

    function setTextForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string calldata key,
        string calldata value,
        uint256 inceptionDate,
        bytes memory signature
    ) external returns (bytes32);

    function clearRecords(address addr) external;
}
