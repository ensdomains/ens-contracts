pragma solidity >=0.8.4;
import "@openzeppelin/contracts/access/Ownable.sol";
import "./profiles/ABIResolver.sol";
import "./profiles/AddrResolver.sol";
import "./profiles/ContentHashResolver.sol";
import "./profiles/DNSResolver.sol";
import "./profiles/InterfaceResolver.sol";
import "./profiles/NameResolver.sol";
import "./profiles/PubkeyResolver.sol";
import "./profiles/TextResolver.sol";
import "./profiles/ExtendedResolver.sol";
import "./Multicallable.sol";
import "./IDelegatableResolver.sol";

/**
 * A delegated resolver that allows for the resolver owner to add an operator to update records of a node on behalf of the owner.
 * address.
 */
contract DelegatableResolver is
    Multicallable,
    ABIResolver,
    AddrResolver,
    ContentHashResolver,
    DNSResolver,
    InterfaceResolver,
    NameResolver,
    PubkeyResolver,
    TextResolver,
    ExtendedResolver
{
    using BytesUtils for bytes;

    // Logged when an operator is added or removed.
    event Approval(
        bytes32 indexed node,
        address indexed operator,
        bytes name,
        bool approved
    );

    error NotAuthorized(bytes32 node);

    constructor(address owner) {
        operators[bytes32(0)][owner] = true;
    }

    //node => (delegate => isAuthorised)
    mapping(bytes32 => mapping(address => bool)) operators;

    /**
     * @dev Check to see if the operator has been approved by the owner for the node.
     */
    function getAuthorizedNode(
        bytes memory name,
        uint256 offset,
        address operator
    ) public view returns (bytes32 node, bool authorized) {
        uint256 len = name.readUint8(offset);
        node = bytes32(0);
        if (len > 0) {
            bytes32 label = name.keccak(offset + 1, len);
            (node, authorized) = getAuthorizedNode(
                name,
                offset + len + 1,
                operator
            );
            node = keccak256(abi.encodePacked(node, label));
        }
        return (node, authorized || operators[node][operator]);
    }

    /**
     * @dev Approve an operator to be able to updated records on a node.
     */
    function approve(
        bytes memory name,
        address operator,
        bool approved
    ) external {
        (bytes32 node, bool authorized) = getAuthorizedNode(
            name,
            0,
            msg.sender
        );
        if (!authorized) {
            revert NotAuthorized(node);
        }
        operators[node][operator] = approved;
        emit Approval(node, operator, name, approved);
    }

    function isAuthorised(bytes32 node) internal view override returns (bool) {
        return isOwner(msg.sender) || operators[node][msg.sender];
    }

    function isOwner(address addr) public view returns (bool) {
        return operators[bytes32(0)][addr];
    }

    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        virtual
        override(
            Multicallable,
            ABIResolver,
            AddrResolver,
            ContentHashResolver,
            DNSResolver,
            InterfaceResolver,
            NameResolver,
            PubkeyResolver,
            TextResolver
        )
        returns (bool)
    {
        return
            interfaceID == type(IDelegatableResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
