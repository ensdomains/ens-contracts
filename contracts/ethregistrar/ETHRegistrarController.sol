pragma solidity >=0.8.4;

import "./PriceOracle.sol";
import "./BaseRegistrarImplementation.sol";
import "./StringUtils.sol";
import "../resolvers/Resolver.sol";
import "../registry/ReverseRegistrar.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@ensdomains/name-wrapper/interfaces/INameWrapper.sol";

import "hardhat/console.sol";

/**
 * @dev A registrar controller for registering and renewing names at fixed cost.
 */
contract ETHRegistrarController is Ownable {
    using StringUtils for *;

    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;

    bytes4 private constant INTERFACE_META_ID =
        bytes4(keccak256("supportsInterface(bytes4)"));
    bytes4 private constant COMMITMENT_CONTROLLER_ID =
        bytes4(
            keccak256("rentPrice(string,uint256)") ^
                keccak256("available(string)") ^
                keccak256("makeCommitment(string,address,bytes32)") ^
                keccak256("commit(bytes32)") ^
                keccak256("register(string,address,uint256,bytes32)") ^
                keccak256("renew(string,uint256)")
        );

    bytes4 private constant COMMITMENT_WITH_CONFIG_CONTROLLER_ID =
        bytes4(
            keccak256(
                "registerWithConfig(string,address,uint256,bytes32,address,address)"
            ) ^
                keccak256(
                    "makeCommitmentWithConfig(string,address,bytes32,address,address,bool,int96)"
                )
        );

    BaseRegistrarImplementation base;
    PriceOracle prices;
    uint256 public minCommitmentAge;
    uint256 public maxCommitmentAge;
    ReverseRegistrar reverseRegistrar;
    INameWrapper nameWrapper;

    mapping(bytes32 => uint256) public commitments;

    event NameRegistered(
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 cost,
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
    ) public {
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
        returns (uint256)
    {
        bytes32 hash = keccak256(bytes(name));
        return prices.price(name, base.nameExpires(uint256(hash)), duration);
    }

    function valid(string memory name) public pure returns (bool) {
        return name.strlen() >= 3;
    }

    function available(string memory name) public view returns (bool) {
        bytes32 label = keccak256(bytes(name));
        return valid(name) && base.available(uint256(label));
    }

    function makeCommitment(
        string memory name,
        address owner,
        bytes32 secret
    ) public pure returns (bytes32) {
        return
            makeCommitmentWithConfig(
                name,
                owner,
                secret,
                address(0),
                address(0),
                false,
                0
            );
    }

    function makeCommitmentWithConfig(
        string memory name,
        address owner,
        bytes32 secret,
        address resolver,
        address addr,
        bool reverseRecord,
        uint96 fuses
    ) public pure returns (bytes32) {
        bytes32 label = keccak256(bytes(name));
        if (resolver == address(0) && addr == address(0)) {
            return keccak256(abi.encodePacked(label, owner, secret));
        }
        require(resolver != address(0));
        return
            keccak256(
                abi.encodePacked(
                    label,
                    owner,
                    resolver,
                    addr,
                    secret,
                    reverseRecord,
                    fuses
                )
            );
    }

    function commit(bytes32 commitment) public {
        require(commitments[commitment] + maxCommitmentAge < block.timestamp);
        commitments[commitment] = block.timestamp;
    }

    function register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret
    ) external payable {
        registerWithConfig(
            name,
            owner,
            duration,
            secret,
            address(0),
            address(0),
            false,
            0
        );
    }

    function registerWithConfig(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        address addr,
        bool reverseRecord,
        uint96 fuses
    ) public payable {
        console.log("start1", gasleft());
        uint256 cost = _consumeCommitment(
            name,
            duration,
            makeCommitmentWithConfig(
                name,
                owner,
                secret,
                resolver,
                addr,
                reverseRecord,
                fuses
            )
        );

        console.log("2 _consumeCommitment", gasleft());

        bytes32 label = keccak256(bytes(name));

        uint256 expires;
        if (resolver != address(0)) {
            expires = _registerWithResolver(
                label,
                name,
                owner,
                duration,
                resolver,
                addr,
                fuses
            );
        } else {
            require(addr == address(0));

            expires = nameWrapper.registerAndWrapETH2LD(
                name,
                owner,
                duration,
                address(0),
                fuses
            );
        }
        if (reverseRecord) {
            //set reverse record to msg.sender
            reverseRegistrar.setNameForAddr(
                msg.sender,
                msg.sender,
                string(abi.encodePacked(name, ".eth"))
            );
        }
        console.log("6 reverse", gasleft());

        emit NameRegistered(name, label, owner, cost, expires);

        // Refund any extra payment
        console.log("7 NameRegistered Event ", gasleft());
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
        console.log("8 transfer back funds", gasleft());
    }

    function renew(string calldata name, uint256 duration) external payable {
        uint256 cost = rentPrice(name, duration);
        require(msg.value >= cost);

        bytes32 label = keccak256(bytes(name));
        uint256 expires = base.renew(uint256(label), duration);

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        emit NameRenewed(name, label, cost, expires);
    }

    function setPriceOracle(PriceOracle _prices) public onlyOwner {
        prices = _prices;
        emit NewPriceOracle(address(prices));
    }

    function setCommitmentAges(
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge
    ) public onlyOwner {
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
    }

    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    function supportsInterface(bytes4 interfaceID)
        external
        pure
        returns (bool)
    {
        return
            interfaceID == INTERFACE_META_ID ||
            interfaceID == COMMITMENT_CONTROLLER_ID ||
            interfaceID == COMMITMENT_WITH_CONFIG_CONTROLLER_ID;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        //TODO: guard against any other contract sending erc1155 to it apart from NameWrapper
        return
            bytes4(
                keccak256(
                    "onERC1155Received(address,address,uint256,uint256,bytes)"
                )
            );
    }

    /* Internal functions */

    function _consumeCommitment(
        string memory name,
        uint256 duration,
        bytes32 commitment
    ) internal returns (uint256) {
        // Require a valid commitment
        require(commitments[commitment] + minCommitmentAge <= block.timestamp);

        // If the commitment is too old, or the name is registered, stop
        require(commitments[commitment] + maxCommitmentAge > block.timestamp);
        require(available(name));

        delete (commitments[commitment]);

        uint256 cost = rentPrice(name, duration);
        require(duration >= MIN_REGISTRATION_DURATION);
        require(msg.value >= cost);

        return cost;
    }

    function _registerWithResolver(
        bytes32 label,
        string calldata name,
        address owner,
        uint256 duration,
        address resolver,
        address addr,
        uint96 fuses
    ) internal returns (uint256 expires) {
        Resolver resolverContract = Resolver(resolver);
        bytes32 nodehash = keccak256(abi.encodePacked(base.baseNode(), label));

        console.log("3 keccak and instiate resolver", gasleft());

        expires = nameWrapper.registerAndWrapETH2LD(
            name,
            owner,
            duration,
            resolver,
            fuses
        );
        console.log("4 registerAndWrap", gasleft());

        if (addr != address(0)) {
            resolverContract.setAddr(nodehash, addr);
        }
        console.log("5 setAddr", gasleft());
    }
}
