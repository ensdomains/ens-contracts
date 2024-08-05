pragma solidity >=0.8.4;

interface ISignatureReverseResolver {
    event ReverseClaimed(address indexed addr, bytes32 indexed node);
    event NameChanged(bytes32 indexed node, string name);

    function setNameForAddrWithSignature(
        address addr,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    ) external returns (bytes32);

    function name(bytes32 node) external view returns (string memory);
}
