pragma solidity >=0.8.4;

import "../registry/ENS.sol";
import "./IL2ReverseRegistrar.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../root/Controllable.sol";
import "./profiles/L2NameResolver.sol";
import "./profiles/L2TextResolver.sol";
import "./profiles/L2ReverseResolverBase.sol";

error InvalidSignature();

contract L2ReverseRegistrar is
    Ownable,
    IL2ReverseRegistrar,
    L2ReverseResolverBase,
    L2NameResolver,
    L2TextResolver
{
    using ECDSA for bytes32;

    event ReverseClaimed(address indexed addr, bytes32 indexed node);
    event DefaultResolverChanged(L2NameResolver indexed resolver);

    uint256 constant EXPIRY = 1 days;

    /**
     * @dev Constructor
     */
    constructor(bytes32 L2ReverseNode) L2ReverseResolverBase(L2ReverseNode) {}

    modifier authorised(address addr) override(L2ReverseResolverBase) {
        isAuthorised(addr);
        _;
    }

    function isAuthorised(address addr) internal view override returns (bool) {
        require(
            addr == msg.sender || ownsContract(addr, msg.sender),
            "ReverseRegistrar: Caller is not a controller or authorised by address or the address itself"
        );
    }

    /**
     * @dev Sets the name for an addr using a signature that can be verified with ERC1271.
     * @param addr The reverse record to set
     * @param name The name of the reverse record
     * @param relayer The relayer of the transaction. Can be address(0) if the user does not want to restrict
     * @param signatureExpiry The resolver of the reverse node
     * @param signature The resolver of the reverse node
     * @return The ENS node hash of the reverse record.
     */
    function setNameForAddrWithSignature(
        address addr,
        string memory name,
        address relayer,
        uint256 signatureExpiry,
        bytes memory signature
    ) public override returns (bytes32) {
        bytes32 labelHash = sha3HexAddress(addr);
        bytes32 reverseNode = keccak256(
            abi.encodePacked(L2_REVERSE_NODE, labelHash)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                IL2ReverseRegistrar.setNameForAddrWithSignature.selector,
                addr,
                name,
                relayer,
                signatureExpiry
            )
        );

        bytes32 message = hash.toEthSignedMessageHash();

        if (
            !SignatureChecker.isValidSignatureNow(addr, message, signature) ||
            (relayer != address(0) && relayer != msg.sender) ||
            signatureExpiry < block.timestamp ||
            signatureExpiry > block.timestamp + EXPIRY
        ) {
            revert InvalidSignature();
        }

        _setName(reverseNode, name);
        return reverseNode;
    }

    /**
     * @dev Sets the name for a contract that is owned by a SCW using a signature
     * @param contractAddr The reverse node to set
     * @param owner The owner of the contract (via Ownable)
     * @param name The name of the reverse record
     * @param relayer The relayer of the transaction. Can be address(0) if the user does not want to restrict
     * @param signatureExpiry The resolver of the reverse node
     * @param signature The signature of an address that will return true on isValidSignature for the owner
     * @return The ENS node hash of the reverse record.
     */
    function setNameForAddrWithSignatureAndOwnable(
        address contractAddr,
        address owner,
        string memory name,
        address relayer,
        uint256 signatureExpiry,
        bytes memory signature
    ) public returns (bytes32) {
        bytes32 labelHash = sha3HexAddress(contractAddr);
        bytes32 reverseNode = keccak256(
            abi.encodePacked(L2_REVERSE_NODE, labelHash)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                IL2ReverseRegistrar.setNameForAddrWithSignature.selector,
                contractAddr,
                owner,
                name,
                relayer,
                signatureExpiry
            )
        );

        bytes32 message = hash.toEthSignedMessageHash();

        if (
            ownsContract(contractAddr, owner) &&
            SignatureChecker.isValidERC1271SignatureNow(
                owner,
                message,
                signature
            )
        ) {
            _setName(reverseNode, name);
            return reverseNode;
        }

        revert InvalidSignature();
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
     * @param name The name to set for this address.
     * @return The ENS node hash of the reverse record.
     */

    function setNameForAddr(
        address addr,
        string memory name
    ) public authorised(addr) returns (bytes32) {
        bytes32 labelHash = sha3HexAddress(addr);
        bytes32 node = keccak256(abi.encodePacked(L2_REVERSE_NODE, labelHash));
        _setName(node, name);
        return node;
    }

    /**
     * @dev Returns the node hash for a given account's reverse records.
     * @param addr The address to hash
     * @return The ENS node hash.
     */
    function node(address addr) public view override returns (bytes32) {
        return
            keccak256(abi.encodePacked(L2_REVERSE_NODE, sha3HexAddress(addr)));
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
        override(L2NameResolver, L2TextResolver, L2ReverseResolverBase)
        returns (bool)
    {
        return
            interfaceID == type(IL2ReverseRegistrar).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
