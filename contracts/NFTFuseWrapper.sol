import "./ERC1155.sol";
import "../interfaces/INFTFuseWrapper.sol";
import "../interfaces/ENS.sol";
import "../interfaces/BaseRegistrar.sol";
import "../interfaces/Resolver.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./BytesUtil.sol";
import "hardhat/console.sol";

contract NFTFuseWrapper is ERC1155, INFTFuseWrapper {
    using BytesUtils for bytes;
    ENS public ens;
    BaseRegistrar public registrar;
    bytes4 public constant ERC721_RECEIVED = 0x150b7a02;

    bytes32 public constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;
    bytes32 public constant ROOT_NODE =
        0x0000000000000000000000000000000000000000000000000000000000000000;

    constructor(ENS _ens, BaseRegistrar _registrar) {
        ens = _ens;
        registrar = _registrar;

        /* Burn CANNOT_REPLACE_SUBDOMAIN and CANNOT_UNWRAP fuses for ROOT_NODE and ETH_NODE */

        setData(
            uint256(ETH_NODE),
            address(0x0),
            uint96(CANNOT_REPLACE_SUBDOMAIN | CANNOT_UNWRAP)
        );
        setData(
            uint256(ROOT_NODE),
            address(0x0),
            uint96(CANNOT_REPLACE_SUBDOMAIN | CANNOT_UNWRAP)
        );
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return
            interfaceId == type(INFTFuseWrapper).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Checks if msg.sender is the owner or approved by the owner of a name
     * @param node namehash of the name to check
     */

    modifier ownerOnly(bytes32 node) {
        require(
            isOwnerOrApproved(node, msg.sender),
            "NFTFuseWrapper: msg.sender is not the owner or approved"
        );
        _;
    }

    /**
     * @notice Checks if owner or approved by owner
     * @param node namehash of the name to check
     * @param addr which address to check permissions for
     * @return whether or not is owner or approved
     */

    function isOwnerOrApproved(bytes32 node, address addr)
        public
        view
        override
        returns (bool)
    {
        return
            ownerOf(uint256(node)) == addr ||
            isApprovedForAll(ownerOf(uint256(node)), addr);
    }

    /**
     * @notice Gets fuse permissions for a specific name
     * @dev Fuses are represented by a uint96 where each permission is represented by 1 bit
     *      The interface has predefined fuses for all registry permissions, but additional
     *      fuses can be added for other use cases
     * @param node namehash of the name to check
     * @return A number that represents the permissions a name has
     */

    function getFuses(bytes32 node) public view returns (uint96) {
        (, uint96 fuses) = getData(uint256(node));
        return fuses;
    }

    /**
     * @notice Check whether a name can be unwrapped
     *
     * @param node namehash of the name to check
     * @return Boolean of whether or not can be wrapped
     */

    function canUnwrap(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_UNWRAP == 0;
    }

    /**
     * @notice Check whether a name can burn fuses
     *
     * @param node namehash of the name to check
     * @return Boolean of whether or not can burn fuses
     */

    function canBurnFuses(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_BURN_FUSES == 0;
    }

    /**
     * @notice Check whether a name can be transferred
     *
     * @param node namehash of the name to check
     * @return Boolean of whether or not can be transferred
     */

    function canTransfer(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_TRANSFER == 0;
    }

    /**
     * @notice Check whether a name can set the resolver
     *
     * @param node namehash of the name to check
     * @return Boolean of whether or not resolver can be set
     */

    function canSetResolver(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_SET_RESOLVER == 0;
    }

    /**
     * @notice Check whether a name can set the TTL
     *
     * @param node namehash of the name to check
     * @return Boolean of whether or not TTL can be set
     */

    function canSetTTL(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_SET_TTL == 0;
    }

    /**
     * @notice Check whether a name can create a subdomain
     * @dev Creating a subdomain is defined as a subdomain that has a 0x0 owner and a new owner is set
     * @param node namehash of the name to check
     * @return Boolean of whether or not subdomains can be created
     */

    function canCreateSubdomain(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_CREATE_SUBDOMAIN == 0;
    }

    /**
     * @notice Check whether a name can replace a subdomain
     * @dev Replacing a subdomain is defined as a subdomain that has an existing owner and is overwritten
     * @param node namehash of the name to check
     * @return Boolean of whether or not TTL can be set
     */

    function canReplaceSubdomain(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_REPLACE_SUBDOMAIN == 0;
    }

    /**
     * @notice Check whether a name can call setSubnodeOwner/setSubnodeRecord
     * @dev Checks both canCreateSubdomain and canReplaceSubdomain and whether not they have been burnt
     *      and checks whether the owner of the subdomain is 0x0 for creating or already exists for
     *      replacing a subdomain. If either conditions are true, then it is possible to call
     *      setSubnodeOwner
     * @param node namehash of the name to check
     * @param label labelhash of the name to check
     * @return Boolean of whether or not setSubnodeOwner/setSubnodeRecord can be called
     */

    function canCallSetSubnodeOwner(bytes32 node, bytes32 label)
        public
        view
        returns (bool)
    {
        bytes32 subnode = _makeNode(node, label);
        address owner = ens.owner(subnode);

        return
            (owner == address(0) && canCreateSubdomain(node)) ||
            (owner != address(0) && canReplaceSubdomain(node));
    }

    /**
     * @notice Wraps a .eth domain, creating a new token and sending the original ERC721 token to this *         contract
     * @dev Can be called by the owner of the name in the .eth registrar or an authorised caller on the *      registrar
     * @param label label as a string of the .eth domain to wrap
     * @param _fuses initial fuses to set
     * @param wrappedOwner Owner of the name in this contract
     */

    function wrapETH2LD(
        string calldata label,
        uint96 _fuses,
        address wrappedOwner
    ) public override {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _makeNode(ETH_NODE, labelhash);
        uint256 tokenId = uint256(labelhash);
        address owner = registrar.ownerOf(tokenId);

        require(
            owner == msg.sender ||
                registrar.isApprovedForAll(owner, msg.sender) ||
                isApprovedForAll(owner, msg.sender),
            "NFTFuseWrapper: Sender is not owner or authorised by the owner or authorised on the .eth registrar"
        );
        // transfer the token from the user to this contract
        address currentOwner = registrar.ownerOf(tokenId);
        registrar.transferFrom(currentOwner, address(this), tokenId);

        // transfer the ens record back to the new owner (this contract)
        _wrapETH2LD(labelhash, node, _fuses, wrappedOwner);
    }

    /**
     * @notice Wraps a non .eth domain, of any kind. Could be a DNSSEC name vitalik.xyz or a subdomain
     * @dev Can be called by the owner in the registry or an authorised caller in the registry
     * @param parentNode parent namehash of the name to wrap e.g. vitalik.xyz would be namehash('xyz')
     * @param label label as a string of the .eth domain to wrap e.g. vitalik.xyz would be 'vitalik'
     * @param _fuses initial fuses to set represented as a number. Check getFuses() for more info
     * @param wrappedOwner Owner of the name in this contract
     */

    function wrap(
        bytes32 parentNode,
        string calldata label,
        uint96 _fuses,
        address wrappedOwner
    ) public override {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _makeNode(parentNode, labelhash);
        _wrap(parentNode, labelhash, _fuses, wrappedOwner);
        address owner = ens.owner(node);

        require(
            owner == msg.sender ||
                ens.isApprovedForAll(owner, msg.sender) ||
                isApprovedForAll(owner, msg.sender),
            "NFTFuseWrapper: Domain is not owned by the sender"
        );
        ens.setOwner(node, address(this));
        emit Wrap(parentNode, label, _fuses, wrappedOwner);
    }

    /**
     * @notice Unwraps a .eth domain. e.g. vitalik.eth
     * @dev Can be called by the owner in the wrapper or an authorised caller in the wrapper
     * @param label label as a string of the .eth domain to wrap e.g. vitalik.xyz would be 'vitalik'
     * @param newRegistrant sets the owner in the .eth registrar to this address
     * @param newController sets the owner in the registry to this address
     */

    function unwrapETH2LD(
        bytes32 label,
        address newRegistrant,
        address newController
    ) public ownerOnly(_makeNode(ETH_NODE, label)) {
        _unwrap(ETH_NODE, label, newController);
        registrar.transferFrom(address(this), newRegistrant, uint256(label));
    }

    /**
     * @notice Unwraps a non .eth domain, of any kind. Could be a DNSSEC name vitalik.xyz or a subdomain
     * @dev Can be called by the owner in the wrapper or an authorised caller in the wrapper
     * @param parentNode parent namehash of the name to wrap e.g. vitalik.xyz would be namehash('xyz')
     * @param label label as a string of the .eth domain to wrap e.g. vitalik.xyz would be 'vitalik'
     * @param newController sets the owner in the registry to this address
     */

    function unwrap(
        bytes32 parentNode,
        bytes32 label,
        address newController
    ) public override ownerOnly(_makeNode(parentNode, label)) {
        require(
            parentNode != ETH_NODE,
            "NFTFuseWrapper: .eth names must be unwrapped with unwrapETH2LD()"
        );
        _unwrap(parentNode, label, newController);
    }

    /**
     * @notice Burns any fuse passed to this function for a name
     * @dev Fuse burns are always additive and will not unburn already burnt fuses
     * @param parentNode parent namehash of the name. e.g. vitalik.xyz would be namehash('xyz')
     * @param labelhash labelhash of the name. e.g. vitalik.xyz would be labelhash('vitalik')
     * @param _fuses Fuses you want to burn.
     */

    function burnFuses(
        bytes32 parentNode,
        bytes32 labelhash,
        uint96 _fuses
    ) public ownerOnly(_makeNode(parentNode, labelhash)) {
        bytes32 node = _makeNode(parentNode, labelhash);

        require(
            canBurnFuses(node),
            "NFTFuseWrapper: Fuse has been burned for burning fuses"
        );

        require(
            !canReplaceSubdomain(parentNode),
            "NFTFuseWrapper: Parent has not burned CAN_REPLACE_SUBDOMAIN fuse"
        );

        (address owner, uint96 fuses) = getData(uint256(node));

        setData(uint256(node), owner, fuses | _fuses);

        require(
            !canUnwrap(node),
            "NFTFuseWrapper: Domain has not burned unwrap fuse"
        );
    }

    /**
     * @notice Sets records for the subdomain in the ENS Registry
     * @param node namehash of the name
     * @param owner newOwner in the registry
     * @param resolver the resolver contract in the registry
     * @param ttl ttl in the registry
     */

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) public ownerOnly(node) {
        require(
            canCallSetSubnodeOwner(node, label),
            "NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain"
        );

        return ens.setSubnodeRecord(node, label, owner, resolver, ttl);
    }

    /**
     * @notice Sets the subnode owner in the registry
     * @param node parent namehash of the subnode
     * @param label labelhash of the subnode
     * @param owner newOwner in the registry
     */

    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address owner
    ) public override ownerOnly(node) returns (bytes32) {
        require(
            canCallSetSubnodeOwner(node, label),
            "NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain"
        );

        ens.setSubnodeOwner(node, label, owner);
    }

    /**
     * @notice Sets the subdomain owner in the registry and then wraps the subdomain
     * @param parentNode parent namehash of the subdomain
     * @param label label of the subdomain as a string
     * @param newOwner newOwner in the registry
     * @param _fuses initial fuses for the wrapped subdomain
     */

    function setSubnodeOwnerAndWrap(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        uint96 _fuses
    ) public override returns (bytes32) {
        require(
            newOwner != address(this),
            "NFTFuseWrapper: newOwner cannot be the NFTFuseWrapper contract"
        );
        bytes32 labelhash = keccak256(bytes(label));
        setSubnodeOwner(parentNode, labelhash, address(this));
        _wrap(parentNode, labelhash, _fuses, newOwner);
        emit Wrap(parentNode, label, _fuses, newOwner);
    }

    /**
     * @notice Sets the subdomain owner in the registry with records and then wraps the subdomain
     * @param parentNode parent namehash of the subdomain
     * @param label label of the subdomain as a string
     * @param newOwner newOwner in the registry
     * @param resolver resolver contract in the registry
     * @param ttl ttl in the regsitry
     * @param _fuses initial fuses for the wrapped subdomain
     */

    function setSubnodeRecordAndWrap(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint64 ttl,
        uint96 _fuses
    ) public override returns (bytes32) {
        require(
            newOwner != address(this),
            "NFTFuseWrapper: newOwner cannot be the NFTFuseWrapper contract"
        );
        bytes32 labelhash = keccak256(bytes(label));
        setSubnodeRecord(parentNode, labelhash, address(this), resolver, ttl);
        _wrap(parentNode, labelhash, _fuses, newOwner);
        emit Wrap(parentNode, label, _fuses, newOwner);
    }

    /**
     * @notice Sets records for the name in the ENS Registry
     * @param node namehash of the name to set a record for
     * @param owner newOwner in the registry
     * @param resolver the resolver contract
     * @param ttl ttl in the registry
     */

    function setRecord(
        bytes32 node,
        address owner,
        address resolver,
        uint64 ttl
    ) public ownerOnly(node) {
        require(
            canTransfer(node),
            "NFTFuseWrapper: Fuse is burned for transferring"
        );

        require(
            canSetResolver(node),
            "NFTFuseWrapper: Fuse is burned for setting resolver"
        );

        require(
            canSetTTL(node),
            "NFTFuseWrapper: Fuse is burned for setting TTL"
        );
        ens.setRecord(node, owner, resolver, ttl);
    }

    /**
     * @notice Sets resolver contract in the registry
     * @param node namehash of the name
     * @param resolver the resolver contract
     */

    function setResolver(bytes32 node, address resolver)
        public
        override
        ownerOnly(node)
    {
        require(
            canSetResolver(node),
            "NFTFuseWrapper: Fuse already burned for setting resolver"
        );
        ens.setResolver(node, resolver);
    }

    /**
     * @notice Sets TTL in the registry
     * @param node namehash of the name
     * @param ttl TTL in the registry
     */

    function setTTL(bytes32 node, uint64 ttl) public override ownerOnly(node) {
        require(
            canSetTTL(node),
            "NFTFuseWrapper: Fuse already burned for setting TTL"
        );
        ens.setTTL(node, ttl);
    }

    /**
     * @notice Sets TTL in the registry
     * @dev only callable by the .eth registrar
     * @param operator sender of the tx, either owner or approved caller
     * @param from owner of the token previously
     * @param tokenId namehash of the name
     * @param data data represents the fuses that will be passed when calling transferFrom on the
     *             .eth registrar
     */

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public returns (bytes4) {
        //check if it's the eth registrar ERC721
        uint96 fuses = 0;
        require(
            msg.sender == address(registrar),
            "NFTFuseWrapper: Wrapper only supports .eth ERC721 token transfers"
        );

        require(
            data.length == 0 || data.length == 12,
            "NFTFuseWrapper: Data is not of length 0 or 12"
        );

        if (data.length == 12) {
            fuses = data.readUint96(0);
        }

        bytes32 node = _makeNode(ETH_NODE, bytes32(tokenId));
        _wrapETH2LD(bytes32(tokenId), node, fuses, from);
        emit WrapETH2LD(bytes32(tokenId), fuses, from);
        return ERC721_RECEIVED;
    }

    /***** Internal functions */

    function _canTransfer(uint96 fuses) internal override returns (bool) {
        return fuses & CANNOT_TRANSFER == 0;
    }

    function _makeNode(bytes32 node, bytes32 label)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(node, label));
    }

    function _mint(
        bytes32 parentNode,
        bytes32 node,
        address newOwner,
        uint96 _fuses
    ) private {
        uint256 tokenId = uint256(node);
        address owner = ownerOf(tokenId);
        require(owner == address(0), "ERC1155: mint of existing token");
        require(newOwner != address(0), "ERC1155: mint to the zero address");
        setData(tokenId, newOwner, _fuses);

        if (_fuses != CAN_DO_EVERYTHING) {
            require(
                !canReplaceSubdomain(parentNode),
                "NFTFuseWrapper: Cannot burn fuses: parent name can replace subdomain"
            );

            require(
                !canUnwrap(node),
                "NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped"
            );
        }
        emit TransferSingle(msg.sender, address(0x0), newOwner, tokenId, 1);
    }

    function _burn(uint256 tokenId) private {
        address owner = ownerOf(tokenId);
        // Clear fuses and set owner to 0
        setData(tokenId, address(0x0), 0);
        emit TransferSingle(msg.sender, owner, address(0x0), tokenId, 1);
    }

    function _wrap(
        bytes32 parentNode,
        bytes32 label,
        uint96 _fuses,
        address wrappedOwner
    ) private {
        require(
            parentNode != ETH_NODE,
            "NFTFuseWrapper: .eth domains need to use the wrapETH2LD"
        );

        bytes32 node = _makeNode(parentNode, label);

        _mint(parentNode, node, wrappedOwner, _fuses);
    }

    function _wrapETH2LD(
        bytes32 label,
        bytes32 node,
        uint96 _fuses,
        address wrappedOwner
    ) private {
        // transfer the ens record back to the new owner (this contract)
        registrar.reclaim(uint256(label), address(this));
        // mint a new ERC1155 token with fuses

        address oldWrappedOwner = ownerOf(uint256(node));
        if (oldWrappedOwner != address(0)) {
            _burn(uint256(node));
        }
        _mint(ETH_NODE, node, wrappedOwner, _fuses);

        emit WrapETH2LD(label, _fuses, wrappedOwner);
    }

    function _unwrap(
        bytes32 parentNode,
        bytes32 label,
        address newOwner
    ) private {
        bytes32 node = _makeNode(parentNode, label);
        require(
            newOwner != address(0x0),
            "NFTFuseWrapper: Target owner cannot be 0x0"
        );
        require(
            newOwner != address(this),
            "NFTFuseWrapper: Target owner cannot be the NFTFuseWrapper contract"
        );
        require(canUnwrap(node), "NFTFuseWrapper: Domain is not unwrappable");

        // burn token and fuse data
        _burn(uint256(node));
        ens.setOwner(node, newOwner);
        emit Unwrap(parentNode, label, newOwner);
    }
}
