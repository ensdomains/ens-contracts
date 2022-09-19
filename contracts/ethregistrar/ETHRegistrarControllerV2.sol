pragma solidity >=0.8.4;

import "./BaseRegistrarImplementation.sol";
import "./StringUtils.sol";
import "../resolvers/Resolver.sol";
import "../registry/ReverseRegistrar.sol";
import "./IETHRegistrarControllerV2.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../wrapper/INameWrapper.sol";

/**
 * @dev A registrar controller for registering and renewing names at fixed cost.
 */
contract ETHRegistrarControllerV2 is Ownable, IETHRegistrarControllerV2 {
    using StringUtils for *;
    using Address for address;

    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;
    bytes32 private constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    BaseRegistrarImplementation immutable base;
    IPriceOracle public immutable prices;
    uint256 public immutable minCommitmentAge;
    uint256 public immutable maxCommitmentAge;
    ReverseRegistrar public immutable reverseRegistrar;
    INameWrapper public immutable nameWrapper;

    mapping(bytes32 => uint256) public commitments;
    mapping(address => mapping(bytes32 => uint256)) public tips;
    uint256 public referralFee = 50;

    /**
     * @dev Constructor
     * @param _base The address of the ENS registry.
     * @param _prices The IPriceOracle interface.
     * @param _minCommitmentAge Minimum commitment time.
     * @param _maxCommitmentAge Maximum commitment time.
     * @param _reverseRegistrar The ReverseRegistrar interface.
     * @param _nameWrapper The INameWrapper interface
     */
    constructor(
        BaseRegistrarImplementation _base,
        IPriceOracle _prices,
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

    /**
     * @dev Checks if the name is available.
     * @param name The name to be checked.
     * @return True if `name` is available.
     */
    function available(string memory name, bytes32 label)
        public
        view
        override
        returns (bool)
    {
        return valid(name) && base.available(uint256(label));
    }

    /**
     * @dev Price of the ENS name, given a duration
     * @param name Name to be checked for availability.
     * @param label The keccak of the name.
     * @param duration The address of the ENS registry.
     * @return price struct from IPriceOracle.
     */
    function rentPrice(
        string memory name,
        bytes32 label,
        uint256 duration
    ) public view override returns (IPriceOracle.Price memory price) {
        price = prices.price(name, base.nameExpires(uint256(label)), duration);
    }

    /**
     * @dev Return True or False for match criteria.
     * @param name The name to be checked.
     * @return True if `lenght` is bigger than 3.
     */
    function valid(string memory name) public pure returns (bool) {
        return name.strlen() >= 3;
    }

    /**
     * @dev Check if interface is implemented.
     * @param interfaceID The first 4 bytes of the interface ID.
     * @return True if interface is supported, false otherwise.
     */
    function supportsInterface(bytes4 interfaceID)
        external
        pure
        returns (bool)
    {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IETHRegistrarControllerV2).interfaceId;
    }

    /**
     * @dev Sets the new referral fee in percentage with one decimal.
     * @param _referralFee The fee to be used. From 0 to 1000.
     */
    function setReferralFee(uint256 _referralFee) external onlyOwner {
        require(
            _referralFee <= 1000,
            "ETHRegistrarControllerV2: Referral fee max is 1000"
        );

        emit ReferralFeeUpdated(referralFee, _referralFee);
        referralFee = _referralFee;
    }

    /**
     * @dev Withdraw everything from balance.
     */
    function withdraw(bytes32 commitment) public override {
        uint256 amount = tips[msg.sender][commitment];
        require(
            amount > 0,
            "ETHRegistrarControllerV2: No balance to withdraw"
        );
        delete (tips[msg.sender][commitment]);
        payable(msg.sender).transfer(amount);
    }

    /**
     * @dev Set the commitment for a given hash as the current block
     *      timestamp. Max commitment must happen at the same instant.
     * @param commitment The hash of the current commitment.
     */
    function commit(bytes32 commitment) public payable override {
        require(
            commitments[commitment] + maxCommitmentAge < block.timestamp,
            "ETHRegistrarControllerV2: Cannot insert timestamp due to max commitment age extrapolation"
        );
        if (msg.value > 0) {
            tips[msg.sender][commitment] = msg.value;
        }
        commitments[commitment] = block.timestamp;
    }

    /**
     * @dev Checks if the name is available.
     * @param registrationBatch The struct that will be keccaked into commit.
     * @return The commitment hash.
     */
    function makeCommitment(RegistrationBatch calldata registrationBatch)
        public
        pure
        override
        returns (bytes32)
    {
        return keccak256(abi.encode(registrationBatch));
    }

    /**
     * @dev Renew a lot of ENS registrations for the same duration.
     * @param names The ENS names to be renewed.
     * @param duration The increase in the duration.
     * @param referrer The referrer to receive the commission.
     */
    function renew(
        string[] calldata names,
        uint256 duration,
        address referrer
    ) external payable override {
        uint256 aggregatedPrice = 0;

        for(uint256 i = 0; i < names.length; i++){
          bytes32 label = keccak256(bytes(names[i]));
          IPriceOracle.Price memory price = rentPrice(names[i], label, duration);
          aggregatedPrice += price.base;

          uint256 expires = base.renew(uint256(label), duration);
          emit NameRenewed(names[i], label, price.base, expires, referrer);
        }  

        _setBalance(referrer, aggregatedPrice, 0);
    }

    /**
     * @dev Register the current ENS domain for a given duration.
     * @param registrationBatch The struct containing all input for registry.
     */
    function register(RegistrationBatch calldata registrationBatch)
        public
        payable
        override
    {
        _consumeCommitment(
            makeCommitment(registrationBatch),
            registrationBatch.creator,
            registrationBatch.tip
        );

        uint256 aggregatedPrice = 0;
        for (uint256 i = 0; i < registrationBatch.registrations.length; i++) {
            aggregatedPrice += _register(registrationBatch.registrations[i]);
        }

        _setBalance(
            registrationBatch.referrer,
            aggregatedPrice,
            registrationBatch.tip
        );
    }

    /**
     * @dev Internal register for more sensitive mechanics.
     * @param registration The struct containing each individual buyer profile.
     * @return The uint256 price for the current name * duration.
     */
    function _register(Registration calldata registration)
        internal
        returns (uint256)
    {
        bytes32 label = keccak256(bytes(registration.name));

        require(valid(registration.name), "ETHRegistrarController: Name is unavailable");
        require(registration.duration >= MIN_REGISTRATION_DURATION);

        IPriceOracle.Price memory price = rentPrice(
            registration.name,
            label,
            registration.duration
        );

        uint256 expires = nameWrapper.registerAndWrapETH2LD(
            registration.name,
            registration.owner,
            registration.duration,
            registration.resolver,
            registration.fuses,
            registration.wrapperExpiry
        );

        if(registration.data.length > 0) {
            _setRecords(registration.resolver, label, registration.data);
        }

        if (registration.reverseRecord) {
            _setReverseRecord(
                registration.name,
                registration.resolver,
                registration.owner
            );
        }

        emit NameRegistered(
            registration.name,
            label,
            registration.owner,
            price.base,
            price.premium,
            expires
        );

        return price.base + price.premium;
    }

    /**
     * @dev Requires a valid commitment (is old enough and is committed).
     * @param commitment The hash of the commitments.
     * @param creator The creator of the commitment.
     * @param tip The tip for executing the transaction.
     */
    function _consumeCommitment(
        bytes32 commitment,
        address creator,
        uint256 tip
    ) internal {
        require(
            commitments[commitment] + minCommitmentAge <= block.timestamp,
            "ETHRegistrarControllerV2: Commitment is not valid"
        );
        require(
            commitments[commitment] + maxCommitmentAge > block.timestamp,
            "ETHRegistrarControllerV2: Commitment has expired or not found"
        );
        delete (commitments[commitment]);

        require(
            tips[creator][commitment] == tip,
            "ETHRegistrarControllerV2: Tip doesnt match commit value"
        );
        if(tip > 0){
          delete(tips[creator][commitment]);
        }
    }

    /**
     * @dev Set the balance after a successful registration or renewal.
     *      Manages tips and referrals based on commit expiration.
     *      For renewals and payment on reveal, tip won't be calculated.
     * @param referrer The referrer of the purchase.
     * @param amount The amount, in wei.
     * @param tip The tip for executing the transaction.
     */
    function _setBalance(
        address referrer,
        uint256 amount,
        uint256 tip
    ) internal {
        if (msg.value >= amount && tip == 0) {
            if (msg.value > amount) {
                payable(msg.sender).transfer(msg.value - amount);
            }
        } else {
            require(
                tip >= amount,
                "ETHRegistrarControllerV2: Not enough ether provided"
            );
            payable(msg.sender).transfer(msg.value + tip - amount);
        }

        if (referrer == address(0) || referralFee == 0) {
            payable(owner()).transfer(amount);
        } else {
            uint256 referralFeePrice = (amount / 1000) * referralFee;
            payable(referrer).transfer(referralFeePrice);
            payable(owner()).transfer(amount - referralFeePrice);
            emit ReferrerReceived(referrer, referralFeePrice);
        }
    }

    /**
     * @dev Set the records by checking if the first few bytes
     *      the hardcoded .eth namehash.
     * @param resolver The resolver to use.
     * @param label The hash of the ENS name.
     */
    function _setRecords(
        address resolver,
        bytes32 label,
        bytes[] calldata data
    ) internal {
        require(
            resolver != address(0),
            "ETHRegistrarControllerV2: resolver is required when data is supplied"
        );
        bytes32 nodehash = keccak256(abi.encodePacked(ETH_NODE, label));
        for (uint256 i = 0; i < data.length; i++) {
            bytes32 txNamehash = bytes32(data[i][4:36]);
            require(
                txNamehash == nodehash,
                "ETHRegistrarControllerV2: Namehash on record do not match the name being registered"
            );
            resolver.functionCall(
                data[i],
                "ETHRegistrarControllerV2: Failed to set Record"
            );
        }
    }

    /**
     * @dev Reverse resolution maps from an address back to a name.
     * @param name The name to be settled.
     * @param resolver The resolver address.
     * @param owner The owner of the ENS reverse record.
     */
    function _setReverseRecord(
        string memory name,
        address resolver,
        address owner
    ) internal {
        reverseRegistrar.setNameForAddr(
            msg.sender,
            owner,
            resolver,
            string.concat(name, ".eth")
        );
    }
}
