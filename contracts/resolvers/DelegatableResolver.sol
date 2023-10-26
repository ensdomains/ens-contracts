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

/**
 * A simple resolver anyone can use; only allows the owner of a node to set its
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

    constructor(address owner) {
        operators[bytes32(0)][owner] = true;
    }

    //node => (delegate => isAuthorised)
    mapping(bytes32 => mapping(address => bool)) operators;

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
        // TODO throw custom error with the node info
        require(authorized, "caller cannot authorise");
        operators[node][operator] = approved;
        emit Approval(node, operator, name, approved);
    }

    // Usage
    // basenode = namehash('onl2.eth')
    // - l2: l2resolver = DelegatableResolver.deploy(ownerAddress)
    // - l1: l1resolver.setVerfierForNode(......, l2resolver)
    // - l1: registry.setResolver(......, l1resolver.address)
    // - l2: subnameregistrar = SubnameRegistar.deploy
    // base = bytes32(0)
    // name = encodename('onl2.eth')
    // - l2: DelegatableResolver.approve(name, subnameregistrar, true)
    // - l2: subnameregistrar.register('makoto')
    // subname = encodename('makoto.onl2.eth')
    //    - lDelegatableResolver.approve(subname, owner, true)

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
        return super.supportsInterface(interfaceID);
    }
}
