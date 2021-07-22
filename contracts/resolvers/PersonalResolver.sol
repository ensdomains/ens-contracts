pragma solidity >=0.8.4;

import "./PersonalResolverFactory.sol";
import "./PersonalProxy.sol";
import "./profiles/ABIResolver.sol";
import "./profiles/AddrResolver.sol";
import "./profiles/ContentHashResolver.sol";
import "./profiles/DNSResolver.sol";
import "./profiles/InterfaceResolver.sol";
import "./profiles/NameResolver.sol";
import "./profiles/PubkeyResolver.sol";
import "./profiles/TextResolver.sol";

interface INameWrapper {
    function ownerOf(uint256 id) external view returns (address);
}

/**
 * A simple resolver anyone can use; only allows the owner of a node to set its
 * address.
 */
contract PersonalResolver is ABIResolver, AddrResolver, ContentHashResolver, DNSResolver, InterfaceResolver, NameResolver, PubkeyResolver, TextResolver {
    address public immutable factory;

    constructor(address _factory){
        factory = _factory;
    }

    /**
     * A mapping of operators. An address that is authorised for an address
     * may make any changes to the name that the owner could, but may not update
     * the set of authorisations.
     * (owner, operator) => approved
     */
    mapping(address => bool) private _operatorApprovals;

    // Logged when an operator is added or removed.
    event ApprovalForAll(address indexed operator, bool approved);

    function isOwner(address addr) internal view returns(bool) {
        return ProxyStorage.addressForOwner(factory, addr) == address(this);
    }

    function upgrade(address implementation) external {
        require(isOwner(msg.sender), "Only owner can upgrade");
        ProxyStorage._setImplementation(implementation);
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(
            msg.sender != operator,
            "ERC1155: setting approval status for self"
        );
        require(isOwner(msg.sender), "Only owner can set approvals");
        _operatorApprovals[operator] = approved;
        emit ApprovalForAll(operator, approved);
    }

    function isApprovedForAll(address operator) public view returns (bool){
        return _operatorApprovals[operator];
    }

    function isAuthorised(bytes32 /* node */) internal override view returns(bool) {
        return isOwner(msg.sender) || isApprovedForAll(msg.sender);
    }

    function supportsInterface(bytes4 interfaceID) virtual override(ABIResolver, AddrResolver, ContentHashResolver, DNSResolver, InterfaceResolver, NameResolver, PubkeyResolver, TextResolver) public pure returns(bool) {
        return super.supportsInterface(interfaceID);
    }
}
