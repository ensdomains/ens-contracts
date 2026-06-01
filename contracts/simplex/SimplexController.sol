//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseRegistrarImplementation} from "../ethregistrar/BaseRegistrarImplementation.sol";
import {StringUtils} from "../utils/StringUtils.sol";
import {Resolver} from "../resolvers/Resolver.sol";
import {ENS} from "../registry/ENS.sol";
import {IReverseRegistrar} from "../reverseRegistrar/IReverseRegistrar.sol";
import {IDefaultReverseRegistrar} from "../reverseRegistrar/IDefaultReverseRegistrar.sol";
import {IETHRegistrarController, IPriceOracle} from "../ethregistrar/IETHRegistrarController.sol";

/// @dev Fork of ETHRegistrarController with additional access controls:
///      - Minimum name length gate (admin can lower monotonically)
///      - Reserved names (admin-managed blocklist)
///      - NFT gate (optional, for .testing TLD)
///
///      Deployed behind an ERC1967 proxy (UUPS). The implementation has
///      its initializers disabled in the constructor; storage lives in
///      the proxy and is preserved across upgrades.
contract SimplexController is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IETHRegistrarController,
    ERC165
{
    using StringUtils for *;

    uint8 constant REVERSE_RECORD_ETHEREUM_BIT = 1;
    uint8 constant REVERSE_RECORD_DEFAULT_BIT = 2;
    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;
    uint64 private constant MAX_EXPIRY = type(uint64).max;

    // Was immutable in the non-upgradeable version. Converted to plain
    // storage so values survive a UUPS upgrade rather than being baked
    // into each implementation's bytecode.
    ENS public ens;
    BaseRegistrarImplementation base;
    uint256 public minCommitmentAge;
    uint256 public maxCommitmentAge;
    IReverseRegistrar public reverseRegistrar;
    IDefaultReverseRegistrar public defaultReverseRegistrar;
    IPriceOracle public prices;
    bytes32 public tldNode;
    string public tldSuffix;

    mapping(bytes32 => uint256) public commitments;

    // --- Simplex additions ---
    uint8 public minCharLength;
    mapping(bytes32 => bool) public reservedNames;
    IERC721 public smpxNft;
    bool public nftGateEnabled;

    error CommitmentNotFound(bytes32 commitment);
    error CommitmentTooNew(bytes32 commitment, uint256 minimumCommitmentTimestamp, uint256 currentTimestamp);
    error CommitmentTooOld(bytes32 commitment, uint256 maximumCommitmentTimestamp, uint256 currentTimestamp);
    error NameNotAvailable(string name);
    error DurationTooShort(uint256 duration);
    error ResolverRequiredWhenDataSupplied();
    error ResolverRequiredForReverseRecord();
    error UnexpiredCommitmentExists(bytes32 commitment);
    error InsufficientValue();
    error TransferFailed();
    error NameNotReserved(string name);
    struct SimplexConfig {
        bytes32 tldNode;
        string tldSuffix;
        uint8 minCharLength;
        IERC721 smpxNft;
        bool nftGateEnabled;
    }

    error MaxCommitmentAgeTooLow();
    error MaxCommitmentAgeTooHigh();
    error NameTooShort(string name, uint8 minLength);
    error NameReserved(string name);
    error NftRequired();
    error MinCharLengthCanOnlyDecrease();
    error NftGateCanOnlyBeDisabled();

    event NameRegistered(
        string label,
        bytes32 indexed labelhash,
        address indexed owner,
        uint256 baseCost,
        uint256 premium,
        uint256 expires,
        bytes32 referrer
    );

    event NameRenewed(
        string label,
        bytes32 indexed labelhash,
        uint256 cost,
        uint256 expires,
        bytes32 referrer
    );

    event MinCharLengthChanged(uint8 newMinCharLength);
    event ReservedNameAdded(string name);
    event ReservedNameRemoved(string name);
    event NftGateDisabled();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        BaseRegistrarImplementation _base,
        IPriceOracle _prices,
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        IReverseRegistrar _reverseRegistrar,
        IDefaultReverseRegistrar _defaultReverseRegistrar,
        ENS _ens,
        SimplexConfig memory _config,
        address _owner
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        if (_maxCommitmentAge <= _minCommitmentAge) revert MaxCommitmentAgeTooLow();
        if (_maxCommitmentAge > block.timestamp) revert MaxCommitmentAgeTooHigh();

        ens = _ens;
        base = _base;
        prices = _prices;
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
        reverseRegistrar = _reverseRegistrar;
        defaultReverseRegistrar = _defaultReverseRegistrar;
        tldNode = _config.tldNode;
        tldSuffix = _config.tldSuffix;
        minCharLength = _config.minCharLength;
        smpxNft = _config.smpxNft;
        nftGateEnabled = _config.nftGateEnabled;

        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Recover ERC20 tokens sent to this contract by mistake.
    function recoverFunds(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        IERC20(_token).transfer(_to, _amount);
    }

    // --- Simplex admin functions ---

    function setMinCharLength(uint8 newMinCharLength) external onlyOwner {
        if (newMinCharLength >= minCharLength) revert MinCharLengthCanOnlyDecrease();
        minCharLength = newMinCharLength;
        emit MinCharLengthChanged(newMinCharLength);
    }

    function addReservedName(string calldata name) external onlyOwner {
        reservedNames[keccak256(bytes(name))] = true;
        emit ReservedNameAdded(name);
    }

    function removeReservedName(string calldata name) external onlyOwner {
        delete reservedNames[keccak256(bytes(name))];
        emit ReservedNameRemoved(name);
    }

    function registerReserved(
        string calldata label,
        address owner,
        uint256 duration
    ) external onlyOwner {
        bytes32 labelhash = keccak256(bytes(label));
        if (!reservedNames[labelhash]) revert NameNotReserved(label);
        if (duration < MIN_REGISTRATION_DURATION) revert DurationTooShort(duration);
        base.register(uint256(labelhash), owner, duration);
    }

    function disableNftGate() external onlyOwner {
        if (!nftGateEnabled) revert NftGateCanOnlyBeDisabled();
        nftGateEnabled = false;
        emit NftGateDisabled();
    }

    // --- ENS controller functions (unchanged logic, added gates) ---

    function rentPrice(
        string calldata label,
        uint256 duration
    ) public view override returns (IPriceOracle.Price memory price) {
        bytes32 labelhash = keccak256(bytes(label));
        price = _rentPrice(label, labelhash, duration);
    }

    function valid(string calldata label) public view returns (bool) {
        return label.strlen() >= minCharLength;
    }

    function available(
        string calldata label
    ) public view override returns (bool) {
        bytes32 labelhash = keccak256(bytes(label));
        return _available(label, labelhash);
    }

    function makeCommitment(
        Registration calldata registration
    ) public pure override returns (bytes32 commitment) {
        if (registration.data.length > 0 && registration.resolver == address(0))
            revert ResolverRequiredWhenDataSupplied();

        if (registration.reverseRecord != 0 && registration.resolver == address(0))
            revert ResolverRequiredForReverseRecord();

        if (registration.duration < MIN_REGISTRATION_DURATION)
            revert DurationTooShort(registration.duration);

        return keccak256(abi.encode(registration));
    }

    function commit(bytes32 commitment) public override {
        if (commitments[commitment] + maxCommitmentAge >= block.timestamp) {
            revert UnexpiredCommitmentExists(commitment);
        }
        commitments[commitment] = block.timestamp;
    }

    function _checkSimplexGates(string calldata label) internal view {
        if (label.strlen() < minCharLength)
            revert NameTooShort(label, minCharLength);
        if (reservedNames[keccak256(bytes(label))])
            revert NameReserved(label);
        if (nftGateEnabled && smpxNft.balanceOf(msg.sender) == 0)
            revert NftRequired();
    }

    function register(
        Registration calldata registration
    ) public payable override {
        _checkSimplexGates(registration.label);

        bytes32 labelhash = keccak256(bytes(registration.label));
        IPriceOracle.Price memory price = _rentPrice(
            registration.label,
            labelhash,
            registration.duration
        );
        uint256 totalPrice = price.base + price.premium;
        if (msg.value < totalPrice) revert InsufficientValue();

        if (!_available(registration.label, labelhash))
            revert NameNotAvailable(registration.label);

        bytes32 commitment = makeCommitment(registration);
        uint256 commitmentTimestamp = commitments[commitment];

        if (commitmentTimestamp + minCommitmentAge > block.timestamp)
            revert CommitmentTooNew(
                commitment,
                commitmentTimestamp + minCommitmentAge,
                block.timestamp
            );

        if (commitmentTimestamp + maxCommitmentAge <= block.timestamp) {
            if (commitmentTimestamp == 0) revert CommitmentNotFound(commitment);
            revert CommitmentTooOld(
                commitment,
                commitmentTimestamp + maxCommitmentAge,
                block.timestamp
            );
        }

        delete (commitments[commitment]);

        uint256 expires;

        if (registration.resolver == address(0)) {
            expires = base.register(
                uint256(labelhash),
                registration.owner,
                registration.duration
            );
        } else {
            expires = base.register(
                uint256(labelhash),
                address(this),
                registration.duration
            );

            bytes32 namehash = keccak256(abi.encodePacked(tldNode, labelhash));
            ens.setRecord(
                namehash,
                registration.owner,
                registration.resolver,
                0
            );
            if (registration.data.length > 0)
                Resolver(registration.resolver).multicallWithNodeCheck(
                    namehash,
                    registration.data
                );

            base.transferFrom(
                address(this),
                registration.owner,
                uint256(labelhash)
            );

            if (registration.reverseRecord & REVERSE_RECORD_ETHEREUM_BIT != 0)
                reverseRegistrar.setNameForAddr(
                    msg.sender,
                    msg.sender,
                    registration.resolver,
                    string.concat(registration.label, tldSuffix)
                );
            if (registration.reverseRecord & REVERSE_RECORD_DEFAULT_BIT != 0)
                defaultReverseRegistrar.setNameForAddr(
                    msg.sender,
                    string.concat(registration.label, tldSuffix)
                );
        }

        emit NameRegistered(
            registration.label,
            labelhash,
            registration.owner,
            price.base,
            price.premium,
            expires,
            registration.referrer
        );

        if (msg.value > totalPrice) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - totalPrice}("");
            if (!ok) revert TransferFailed();
        }
    }

    function renew(
        string calldata label,
        uint256 duration,
        bytes32 referrer
    ) external payable override {
        bytes32 labelhash = keccak256(bytes(label));

        IPriceOracle.Price memory price = _rentPrice(label, labelhash, duration);
        if (msg.value < price.base) revert InsufficientValue();

        uint256 expires = base.renew(uint256(labelhash), duration);

        emit NameRenewed(label, labelhash, price.base, expires, referrer);

        if (msg.value > price.base) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - price.base}("");
            if (!ok) revert TransferFailed();
        }
    }

    function withdraw() public {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view override returns (bool) {
        return
            interfaceID == type(IETHRegistrarController).interfaceId ||
            super.supportsInterface(interfaceID);
    }

    /* Internal functions */

    function _rentPrice(
        string calldata label,
        bytes32 labelhash,
        uint256 duration
    ) internal view returns (IPriceOracle.Price memory price) {
        price = prices.price(
            label,
            base.nameExpires(uint256(labelhash)),
            duration
        );
    }

    function _available(
        string calldata label,
        bytes32 labelhash
    ) internal view returns (bool) {
        return valid(label) && base.available(uint256(labelhash));
    }

    /// @dev Reserved storage to allow new state variables in upgrades
    ///      without colliding with child contracts. Use indices from the
    ///      front of the array; the size shrinks as state variables are
    ///      added in future versions.
    uint256[50] private __gap;
}
