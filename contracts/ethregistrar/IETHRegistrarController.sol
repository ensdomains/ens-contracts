pragma solidity >=0.8.4;

import "./PriceOracle.sol";

interface IETHRegistrarController {
    function rentPrice(string memory, uint256)
        external
        returns (uint256 base, uint256 premium);

    function rentDuration(string memory, uint256)
        external
        returns (uint256 duration, uint256 premium);

    function available(string memory) external returns (bool);

    function makeCommitment(
        string memory,
        address,
        bytes32,
        address,
        bytes[] calldata,
        bool,
        uint96
    ) external returns (bytes32);

    function commit(bytes32) external;

    function register(
        string calldata,
        address,
        bytes32,
        address,
        bytes[] calldata,
        bool,
        uint96
    ) external payable;

    function renew(string calldata) external payable;
}
