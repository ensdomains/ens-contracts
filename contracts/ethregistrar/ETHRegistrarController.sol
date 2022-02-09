pragma solidity >=0.8.4;

import "./BaseRegistrarImplementation.sol";
import "./StringUtils.sol";
import "../resolvers/Resolver.sol";
import "../registry/ReverseRegistrar.sol";
import "../dnssec-oracle/BytesUtils.sol";
import "./IETHRegistrarController.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../wrapper/INameWrapper.sol";

/**
 * @dev A registrar controller for registering and renewing names at fixed cost.
 */
contract ETHRegistrarController is Ownable, IETHRegistrarController {
    using StringUtils for *;
    using BytesUtils for bytes;

    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;
    bytes32 private constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    BaseRegistrarImplementation immutable base;
    PriceOracle public prices;
    uint256 public immutable minCommitmentAge;
    uint256 public immutable maxCommitmentAge;
    ReverseRegistrar public immutable reverseRegistrar;
    INameWrapper public immutable nameWrapper;

    mapping(bytes32 => uint256) public commitments;

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
        uint256 expires
    );
    event NewPriceOracle(address indexed oracle);

    constructor(
        BaseRegistrarImplementation _base,
        PriceOracle _prices,
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        ReverseRegistrar _reverseRegistrar,
        INameWrapper _nameWrapper
    ) {
        require(_maxCommitmentAge > _minCommitmentAge);

        base = _base;
        prices = _prices;
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
        reverseRegistrar = _reverseRegistrar;
        nameWrapper = _nameWrapper;
    }

    function rentPrice(string memory name, uint256 duration)
        public
        view
        override
        returns (uint256 basePrice, uint256 premiumPrice)
    {
        bytes32 hash = keccak256(bytes(name));
        (basePrice, premiumPrice) = prices.price(
            name,
            base.nameExpires(uint256(hash)),
            duration
        );
    }

    function rentDuration(string memory name, uint256 cost)
        public
        view
        override
        returns (uint256 duration, uint256 premiumPrice)
    {
        bytes32 hash = keccak256(bytes(name));
        (duration, premiumPrice) = prices.duration(
            name,
            base.nameExpires(uint256(hash)),
            cost
        );
    }

    function valid(string memory name) public pure returns (bool) {
        return name.strlen() >= 3;
    }

    function available(string memory name) public view override returns (bool) {
        bytes32 label = keccak256(bytes(name));
        return valid(name) && base.available(uint256(label));
    }

    function makeCommitment(
        string memory name,
        address owner,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint96 fuses
    ) public pure override returns (bytes32) {
        bytes32 label = keccak256(bytes(name));
        if (data.length > 0) {
            require(
                resolver != address(0),
                "ETHRegistrarController: resolver is required when data is supplied"
            );
        }
        return
            keccak256(
                abi.encode(
                    label,
                    owner,
                    resolver,
                    data,
                    secret,
                    reverseRecord,
                    fuses
                )
            );
    }

    function commit(bytes32 commitment) public override {
        require(commitments[commitment] + maxCommitmentAge < block.timestamp);
        commitments[commitment] = block.timestamp;
    }

    function register(
        string calldata name,
        address owner,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint96 fuses
    ) public payable override {
        bytes32 label = keccak256(bytes(name));
        (uint256 duration, uint256 premiumCost) = prices.duration(
            name,
            base.nameExpires(uint256(label)),
            msg.value
        );
        _consumeCommitment(
            name,
            duration,
            makeCommitment(
                name,
                owner,
                secret,
                resolver,
                data,
                reverseRecord,
                fuses
            )
        );

        uint256 expires = nameWrapper.registerAndWrapETH2LD(
            name,
            owner,
            duration,
            resolver,
            fuses
        );

        _setRecords(resolver, label, data);

        if (reverseRecord) {
            _setReverseRecord(name, resolver, msg.sender);
        }

        emit NameRegistered(
            name,
            label,
            owner,
            msg.value - premiumCost,
            premiumCost,
            expires
        );
    }

    function renew(string calldata name) external payable override {
        bytes32 label = keccak256(bytes(name));
        (uint256 duration, ) = prices.duration(
            name,
            base.nameExpires(uint256(label)),
            msg.value
        );

        uint256 expires = base.renew(uint256(label), duration);

        emit NameRenewed(name, label, msg.value, expires);
    }

    function setPriceOracle(PriceOracle _prices) public onlyOwner {
        prices = _prices;
        emit NewPriceOracle(address(prices));
    }

    function withdraw() public {
        payable(owner()).transfer(address(this).balance);
    }

    function supportsInterface(bytes4 interfaceID)
        external
        pure
        returns (bool)
    {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IETHRegistrarController).interfaceId;
    }

    /* Internal functions */

    function _consumeCommitment(
        string memory name,
        uint256 duration,
        bytes32 commitment
    ) internal {
        // Require a valid commitment
        require(commitments[commitment] + minCommitmentAge <= block.timestamp);

        // If the commitment is too old, or the name is registered, stop
        require(commitments[commitment] + maxCommitmentAge > block.timestamp);
        require(available(name));

        delete (commitments[commitment]);

        require(duration >= MIN_REGISTRATION_DURATION);
    }

    function _setRecords(
        address resolver,
        bytes32 label,
        bytes[] calldata data
    ) internal {
        // use hardcoded .eth namehash
        bytes32 nodehash = keccak256(abi.encodePacked(ETH_NODE, label));
        for (uint256 i = 0; i < data.length; i++) {
            // check first few bytes are namehash
            bytes32 txNamehash = bytes32(data[i][4:36]);
            require(
                txNamehash == nodehash,
                "ETHRegistrarController: Namehash on record do not match the name being registered"
            );
            (bool success, ) = address(resolver).call(data[i]);
            require(success, "ETHRegistrarController: Failed to set Record");
        }
    }

    function _setReverseRecord(
        string calldata name,
        address resolver,
        address owner
    ) internal {
        reverseRegistrar.setNameForAddr(
            msg.sender,
            owner,
            resolver,
            string(abi.encodePacked(name, ".eth"))
        );
    }
}
