pragma solidity >=0.8.4;

interface ISignatureReverseResolver {
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
