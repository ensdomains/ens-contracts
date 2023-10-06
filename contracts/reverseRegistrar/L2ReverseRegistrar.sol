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
            addr == msg.sender || ownsContract(addr),
            "ReverseRegistrar: Caller is not a controller or authorised by address or the address itself"
        );
    }

    /**
     * @dev Transfers ownership of the reverse ENS record associated with the
     *      calling account.
     * @param addr The reverse record to set
     * @param owner The address to set as the owner of the reverse record in ENS.
     * @param resolver The resolver of the reverse node
     * @return The ENS node hash of the reverse record.
     */
    function setNameForAddrWithSignature(
        address addr,
        address owner,
        string memory name,
        address resolver,
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
                owner,
                name,
                resolver,
                relayer,
                signatureExpiry
            )
        );

        bytes32 message = hash.toEthSignedMessageHash();

        if (
            !SignatureChecker.isValidSignatureNow(addr, message, signature) ||
            relayer != msg.sender ||
            signatureExpiry < block.timestamp ||
            signatureExpiry > block.timestamp + 1 days
        ) {
            revert InvalidSignature();
        }

        _setName(reverseNode, name);
        return reverseNode;
    }

    /**
     * @dev Sets the `name()` record for the reverse ENS record associated with
     * the calling account.
     * @param name The name to set for this address.
     * @return The ENS node hash of the reverse record.
     */
    function setName(string memory name) public override returns (bytes32) {
        return setNameForAddr(msg.sender, msg.sender, name);
    }

    function setNameForAddr(
        address addr,
        address owner,
        string memory name
    ) internal returns (bytes32) {
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

    function ownsContract(address addr) internal view returns (bool) {
        try Ownable(addr).owner() returns (address owner) {
            return owner == msg.sender;
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
