pragma solidity >=0.8.4;

import "../registry/ENS.sol";
import "./IL2ReverseResolver.sol";
import "./SignatureReverseResolver.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../resolvers/profiles/ITextResolver.sol";
import "../resolvers/profiles/INameResolver.sol";
import "../root/Controllable.sol";
import "../resolvers/Multicallable.sol";
import "../utils/LowLevelCallUtils.sol";

error NotOwnerOfContract();

/**
 * A L2 reverser registrar. Deployed to each L2 chain.
 */
contract L2ReverseRegistrar is
    Multicallable,
    IL2ReverseResolver,
    SignatureReverseResolver
{
    using ECDSA for bytes32;

    bytes32 public immutable L2ReverseNode;

    /*
     * @dev Constructor
     * @param _L2ReverseNode The namespace to set. The converntion is '${coinType}.reverse'
     * @param _coinType The cointype converted from the chainId of the chain this contract is deployed to.
     */
    constructor(
        bytes32 _L2ReverseNode,
        uint256 _coinType
    ) SignatureReverseResolver(_L2ReverseNode, _coinType) {
        L2ReverseNode = _L2ReverseNode;
    }

    modifier ownerAndAuthorisedWithSignature(
        bytes32 hash,
        address addr,
        address owner,
        uint256 inceptionDate,
        bytes memory signature
    ) {
        isOwnerAndAuthorisedWithSignature(
            hash,
            addr,
            owner,
            inceptionDate,
            signature
        );
        _;
    }

    function isAuthorised(address addr) internal view override returns (bool) {
        if (addr != msg.sender && !ownsContract(addr, msg.sender)) {
            revert Unauthorised();
        }
    }

    function computeOwnerMessage(
        bytes32 hash,
        address addr,
        address owner,
        uint256 inceptionDate
    ) public view returns (bytes32) {
        // Follow ERC191 version 0 https://eips.ethereum.org/EIPS/eip-191
        return
            keccak256(
                abi.encodePacked(
                    address(this),
                    hash,
                    addr,
                    owner,
                    inceptionDate,
                    coinType
                )
            ).toEthSignedMessageHash();
    }

    function isOwnerAndAuthorisedWithSignature(
        bytes32 hash,
        address addr,
        address owner,
        uint256 inceptionDate,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 message = computeOwnerMessage(hash, addr, owner, inceptionDate);
        bytes32 node = _getNamehash(addr);

        if (!ownsContract(addr, owner)) {
            revert NotOwnerOfContract();
        }

        if (
            !SignatureChecker.isValidERC1271SignatureNow(
                owner,
                message,
                signature
            )
        ) {
            revert InvalidSignature();
        }

        if (
            inceptionDate <= lastUpdated[node] || // must be newer than current record
            inceptionDate / 1000 >= block.timestamp // must be in the past
        ) {
            revert InvalidSignatureDate();
        }
    }

    /**
     * @dev Sets the name for a contract that is owned by a SCW using a signature
     * @param contractAddr The reverse node to set
     * @param owner The owner of the contract (via Ownable)
     * @param name The name of the reverse record
     * @param inceptionDate Date from when this signature is valid from
     * @param signature The signature of an address that will return true on isValidSignature for the owner
     * @return The ENS node hash of the reverse record.
     */
    function setNameForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string memory name,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        ownerAndAuthorisedWithSignature(
            keccak256(
                abi.encodePacked(
                    IL2ReverseResolver
                        .setNameForAddrWithSignatureAndOwnable
                        .selector,
                    name
                )
            ),
            contractAddr,
            owner,
            inceptionDate,
            signature
        )
        returns (bytes32)
    {
        bytes32 node = _getNamehash(contractAddr);
        _setName(node, name, inceptionDate);
        emit ReverseClaimed(contractAddr, node);
    }

    /**
     * @dev Sets the `name()` record for the reverse ENS record associated with
     * the calling account.
     * @param name The name to set for this address.
     * @return The ENS node hash of the reverse record.
     */
    function setName(string memory name) public override returns (bytes32) {
        return setNameForAddr(msg.sender, name);
    }

    /**
     * @dev Sets the `name()` record for the reverse ENS record associated with
     * the addr provided account.
     * Can be used if the addr is a contract that is owned by a SCW.
     * @param name The name to set for this address.
     * @return The ENS node hash of the reverse record.
     */

    function setNameForAddr(
        address addr,
        string memory name
    ) public authorised(addr) returns (bytes32) {
        bytes32 node = _getNamehash(addr);
        _setName(node, name, block.timestamp);
        emit ReverseClaimed(addr, node);
        return node;
    }

    /**
     * @dev Sets the name for a contract that is owned by a SCW using a signature
     * @param contractAddr The reverse node to set
     * @param owner The owner of the contract (via Ownable)
     * @param key The name of the reverse record
     * @param value The name of the reverse record
     * @param inceptionDate Date from when this signature is valid from
     * @param signature The signature of an address that will return true on isValidSignature for the owner
     * @return The ENS node hash of the reverse record.
     */
    function setTextForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string calldata key,
        string calldata value,
        uint256 inceptionDate,
        bytes memory signature
    )
        public
        ownerAndAuthorisedWithSignature(
            keccak256(
                abi.encodePacked(
                    IL2ReverseResolver
                        .setTextForAddrWithSignatureAndOwnable
                        .selector,
                    key,
                    value
                )
            ),
            contractAddr,
            owner,
            inceptionDate,
            signature
        )
        returns (bytes32)
    {
        bytes32 node = _getNamehash(contractAddr);
        _setText(node, key, value, inceptionDate);
    }

    /**
     * @dev Sets the `name()` record for the reverse ENS record associated with
     * the calling account.
     * @param key The key for this text record.
     * @param value The value to set for this text record.
     * @return The ENS node hash of the reverse record.
     */
    function setText(
        string calldata key,
        string calldata value
    ) public override returns (bytes32) {
        return setTextForAddr(msg.sender, key, value);
    }

    /**
     * @dev Sets the `text(key)` record for the reverse ENS record associated with
     * the addr provided account.
     * @param key The key for this text record.
     * @param value The value to set for this text record.
     * @return The ENS node hash of the reverse record.
     */

    function setTextForAddr(
        address addr,
        string calldata key,
        string calldata value
    ) public override authorised(addr) returns (bytes32) {
        bytes32 node = _getNamehash(addr);
        _setText(node, key, value, block.timestamp);
        return node;
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param addr The node to update.
     */
    function clearRecords(address addr) public virtual authorised(addr) {
        _clearRecords(addr);
    }

    function ownsContract(
        address contractAddr,
        address addr
    ) internal view returns (bool) {
        try Ownable(contractAddr).owner() returns (address owner) {
            return owner == addr;
        } catch {
            return false;
        }
    }

    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        override(Multicallable, SignatureReverseResolver)
        returns (bool)
    {
        return
            interfaceID == type(IL2ReverseResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
