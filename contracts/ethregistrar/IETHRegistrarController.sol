//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "./IPriceOracle.sol";

interface IETHRegistrarController {
    struct Registration {
        string label;
        address owner;
        uint256 duration;
        bytes32 secret;
        address resolver;
        bytes[] data;
        uint8 reverseRecord;
        bytes32 referrer;
    }

    function rentPrice(
        string memory label,
        uint256 duration
    ) external view returns (IPriceOracle.Price memory);

    function available(string memory label) external returns (bool);

    function makeCommitment(
        Registration memory registration
    ) external pure returns (bytes32 commitment);

    function commit(bytes32 commitment) external;

    function register(Registration memory registration) external payable;

    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable;
}
