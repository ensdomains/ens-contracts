pragma solidity >=0.8.4;

import "./IPriceOracle.sol";

interface IETHRegistrarControllerV2 {
    struct RegistrationBatch {
        address creator;
        address referrer;
        bytes32 secret;
        uint256 tip;
        Registration[] registrations;
    }
    struct Registration {
        string name;
        address owner;
        uint256 duration;
        address resolver;
        bytes[] data;
        bool reverseRecord;
        uint32 fuses;
        uint64 wrapperExpiry;
    }

    event NameRegistered(
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 baseCost,
        uint256 premium,
        uint256 expires
    );
    event NameRenewed(
        string name,
        bytes32 indexed label,
        uint256 cost,
        uint256 expires,
        address referrer
    );
    event ReferrerReceived(address indexed referrer, uint256 amount);
    event ReferralFeeUpdated(uint256 indexed prevFee, uint256 indexed curFee);

    function rentPrice(string memory, bytes32, uint256)
        external
        returns (IPriceOracle.Price memory);

    function available(string memory, bytes32) external returns (bool);

    function makeCommitment(RegistrationBatch calldata) external returns (bytes32);

    function commit(bytes32) external payable;

    function withdraw(bytes32) external;

    function register(RegistrationBatch calldata) external payable;

    function renew(
        string[] calldata,
        uint256,
        address
    ) external payable;
}
