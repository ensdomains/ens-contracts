pragma solidity >=0.8.4;
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
import {Clone} from "clones-with-immutable-args/src/Clone.sol";

/**
 * A delegated resolver that allows the resolver owner to add an owner to update records of a node on behalf of the owner.
 * address.
 */
contract DelegatableResolver is
    Clone,
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

    // Logged when an owner is added or removed.
    event Approval(
        bytes32 indexed node,
        address indexed owner,
        bytes name,
        bool approved
    );

    error NotAuthorized(bytes32 node);
    error WrongNode(bytes32 node, address owner);

    //node => owner
    mapping(bytes32 => address) owners;

    /*
     * Check to see if the owner has been approved by the owner for the node.
     * @param name The ENS node to query
     * @param offset The offset of the label to query recursively. Start from the 0 position and kepp adding the length of each label as it traverse. The function exits when len is 0.
     * @return node The node of the name passed as an argument
     * @return owner The boolean state of whether the owner is approved to update record of the name
     */
    function getAuthorisedNode(
        bytes memory name,
        uint256 offset
    ) public view returns (bytes32 node, address owner) {
        uint256 len = name.readUint8(offset);
        bytes32 node = bytes32(0);
        address owner = address(0);
        if (len > 0) {
            bytes32 label = name.keccak(offset + 1, len);
            (node, owner) = getAuthorisedNode(name, offset + len + 1);
            node = keccak256(abi.encodePacked(node, label));
            owner = owners[node];
            if (owner != address(0)) {
                return (node, owner);
            }
        } else {
            return (bytes32(0), address(0));
        }
        return (node, owner);
    }

    /**
     * @dev Approve an owner to be able to updated records on a node.
     */
    function approve(
        bytes memory name,
        address newowner,
        bool approved
    ) external {
        (bytes32 node, address owner) = getAuthorisedNode(name, 0);
        if (!(owner == msg.sender || contractowner() == msg.sender)) {
            revert NotAuthorized(node);
        }
        if (approved) {
            owners[node] = newowner;
            // revert WrongNode(node, newowner);
        } else {
            owners[node] = address(0);
        }
        emit Approval(node, newowner, name, approved);
    }

    /*
     * Returns the owner address passed set by the Factory
     * @return address The owner address
     */
    function contractowner() public view returns (address) {
        return _getArgAddress(0);
    }

    function isAuthorised(bytes32 node) internal view override returns (bool) {
        return msg.sender == contractowner() || owners[node] == msg.sender;
    }

    function id() public view returns (bytes4) {
        return type(IDelegatableResolver).interfaceId;
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
