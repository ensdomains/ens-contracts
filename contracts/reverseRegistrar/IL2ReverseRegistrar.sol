pragma solidity >=0.8.4;

interface IL2ReverseRegistrar {
    function setName(string memory name) external returns (bytes32);

    function setNameForAddr(
        address addr,
        address owner,
        string memory name
    ) external returns (bytes32);

    function setNameForAddrWithSignature(
        address addr,
        address owner,
        string memory name,
        address resolver,
        address relayer,
        uint256 signatureExpiry,
        bytes memory signature
    ) external returns (bytes32);

    function node(address addr) external view returns (bytes32);
}