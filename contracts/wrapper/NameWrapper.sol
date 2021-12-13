//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ERC1155Fuse.sol";
import "./Controllable.sol";
import "./INameWrapper.sol";
import "./IMetadataService.sol";
import "../registry/ENS.sol";
import "../ethregistrar/BaseRegistrar.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BytesUtil.sol";

contract NameWrapper is
    Ownable,
    ERC1155Fuse,
    INameWrapper,
    Controllable,
    IERC721Receiver
{
    using BytesUtils for bytes;
    ENS public immutable override ens;
    BaseRegistrar public immutable override registrar;
    IMetadataService public override metadataService;
    mapping(bytes32 => bytes) public override names;

    bytes32 private constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;
    bytes32 private constant ROOT_NODE =
        0x0000000000000000000000000000000000000000000000000000000000000000;

    constructor(
        ENS _ens,
        BaseRegistrar _registrar,
        IMetadataService _metadataService
    ) {
        ens = _ens;
        registrar = _registrar;
        metadataService = _metadataService;

        /* Burn CANNOT_REPLACE_SUBDOMAIN and CANNOT_UNWRAP fuses for ROOT_NODE and ETH_NODE */

        _setData(
            uint256(ETH_NODE),
            address(0x0),
            uint96(CANNOT_REPLACE_SUBDOMAIN | CANNOT_UNWRAP)
        );
        _setData(
            uint256(ROOT_NODE),
            address(0x0),
            uint96(CANNOT_REPLACE_SUBDOMAIN | CANNOT_UNWRAP)
        );
        names[ROOT_NODE] = "\x00";
        names[ETH_NODE] = "\x03eth\x00";
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155Fuse, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(INameWrapper).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /* Metadata service */

    /**
     * @notice Set the metadata service. only admin can do this
     */

    function setMetadataService(IMetadataService _newMetadataService)
        public
        onlyOwner()
    {
        metadataService = _newMetadataService;
    }

    /**
     * @notice Get the metadata uri
     * @return String uri of the metadata service
     */

    function uri(uint256 tokenId) public view override returns (string memory) {
        return metadataService.uri(tokenId);
    }

    /**
     * @notice Checks if msg.sender is the owner or approved by the owner of a name
     * @param node namehash of the name to check
     */

    modifier onlyTokenOwner(bytes32 node) {
        require(
            isTokenOwnerOrApproved(node, msg.sender),
            "NameWrapper: msg.sender is not the owner or approved"
        );
        _;
    }

    /**
     * @notice Checks if owner or approved by owner
     * @param node namehash of the name to check
     * @param addr which address to check permissions for
     * @return whether or not is owner or approved
     */

    function isTokenOwnerOrApproved(bytes32 node, address addr)
        public
        view
        override
        returns (bool)
    {
        address owner = ownerOf(uint256(node));
        return
            owner == addr ||
            isApprovedForAll(owner, addr);
    }

    /**
     * @notice Gets fuse permissions for a specific name
     * @dev Fuses are represented by a uint96 where each permission is represented by 1 bit
     *      The interface has predefined fuses for all registry permissions, but additional
     *      fuses can be added for other use cases
     * @param node namehash of the name to check
     * @return fuses A number that represents the permissions a name has
     * @return vulnerability The type of vulnerability
     * @return vulnerableNode Which node is vulnerable
     */
    function getFuses(bytes32 node)
        public
        view
        override
        returns (
            uint96 fuses,
            NameSafety vulnerability,
            bytes32 vulnerableNode
        )
    {
        bytes memory name = names[node];
        require(name.length > 0, "NameWrapper: Name not found");
        (, vulnerability, vulnerableNode) = _checkHierarchy(name, 0);
        (, fuses) = getData(uint256(node));
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
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) public override {
        uint256 tokenId = uint256(keccak256(bytes(label)));
        address registrant = registrar.ownerOf(tokenId);

        require(
            registrant == msg.sender ||
                isApprovedForAll(registrant, msg.sender) ||
                registrar.isApprovedForAll(registrant, msg.sender),
            "NameWrapper: Sender is not owner or authorised by the owner or authorised on the .eth registrar"
        );

        // transfer the token from the user to this contract
        registrar.transferFrom(registrant, address(this), tokenId);

        // transfer the ens record back to the new owner (this contract)
        registrar.reclaim(tokenId, address(this));

        _wrapETH2LD(label, wrappedOwner, _fuses, resolver);
    }

    /**
     * @dev Registers a new .eth second-level domain and wraps it.
     *      Only callable by authorised controllers.
     * @param label The label to register (Eg, 'foo' for 'foo.eth').
     * @param wrappedOwner The owner of the wrapped name.
     * @param duration The duration, in seconds, to register the name for.
     * @param resolver The resolver address to set on the ENS registry (optional).
     * @return expires The expiry date of the new name, in seconds since the Unix epoch.
     */
    function registerAndWrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint256 duration,
        address resolver,
        uint96 _fuses
    ) external override onlyController returns (uint256 expires) {
        uint256 tokenId = uint256(keccak256(bytes(label)));

        expires = registrar.register(tokenId, address(this), duration);
        _wrapETH2LD(label, wrappedOwner, _fuses, resolver);
    }

    /**
     * @dev Renews a .eth second-level domain.
     *      Only callable by authorised controllers.
     * @param tokenId The hash of the label to register (eg, `keccak256('foo')`, for 'foo.eth').
     * @param duration The number of seconds to renew the name for.
     * @return expires The expiry date of the name, in seconds since the Unix epoch.
     */
    function renew(uint256 tokenId, uint256 duration)
        external
        override
        onlyController
        returns (uint256 expires)
    {
        return registrar.renew(tokenId, duration);
    }

    /**
     * @notice Wraps a non .eth domain, of any kind. Could be a DNSSEC name vitalik.xyz or a subdomain
     * @dev Can be called by the owner in the registry or an authorised caller in the registry
     * @param name The name to wrap, in DNS format
     * @param _fuses initial fuses to set represented as a number. Check getFuses() for more info
     * @param wrappedOwner Owner of the name in this contract
     */

    function wrap(
        bytes calldata name,
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) public override {
        (bytes32 labelhash, uint offset) = name.readLabel(0);
        bytes32 parentNode = name.namehash(offset);
        bytes32 node = _makeNode(parentNode, labelhash);

        require(
            parentNode != ETH_NODE,
            "NameWrapper: .eth domains need to use wrapETH2LD()"
        );

        address owner = ens.owner(node);
        require(
            owner == msg.sender ||
                isApprovedForAll(owner, msg.sender) ||
                ens.isApprovedForAll(owner, msg.sender),
            "NameWrapper: Domain is not owned by the sender"
        );

        if (resolver != address(0)) {
            ens.setResolver(node, resolver);
        }

        ens.setOwner(node, address(this));

        _wrap(node, name, wrappedOwner, _fuses);
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
    ) public override onlyTokenOwner(_makeNode(ETH_NODE, label)) {
        _unwrap(_makeNode(ETH_NODE, label), newController);
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
    ) public override onlyTokenOwner(_makeNode(parentNode, label)) {
        require(
            parentNode != ETH_NODE,
            "NameWrapper: .eth names must be unwrapped with unwrapETH2LD()"
        );
        _unwrap(_makeNode(parentNode, label), newController);
    }

    /**
     * @notice Burns any fuse passed to this function for a name
     * @dev Fuse burns are always additive and will not unburn already burnt fuses
     * @param node namehash of the name. e.g. vitalik.xyz would be namehash('vitalik.xyz')
     * @param _fuses Fuses you want to burn.
     */

    function burnFuses(bytes32 node, uint96 _fuses)
        public
        override
        onlyTokenOwner(node)
        operationAllowed(node, CANNOT_BURN_FUSES)
    {
        (address owner, uint96 fuses) = getData(uint256(node));

        uint96 newFuses = fuses | _fuses;

        _setData(uint256(node), owner, newFuses);

        emit FusesBurned(node, newFuses);
    }

    /**
     * @notice Sets records for the subdomain in the ENS Registry
     * @param parentNode namehash of the parent name
     * @param label labelhash of the subnode
     * @param owner newOwner in the registry
     * @param resolver the resolver contract in the registry
     * @param ttl ttl in the registry
     */

    function setSubnodeRecord(
        bytes32 parentNode,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    )
        public
        override
        onlyTokenOwner(parentNode)
        canCallSetSubnodeOwner(parentNode, label)
    {
        ens.setSubnodeRecord(parentNode, label, owner, resolver, ttl);
    }

    /**
     * @notice Sets the subnode owner in the registry
     * @param parentNode namehash of the parent name
     * @param label labelhash of the subnode
     * @param owner newOwner in the registry
     */

    function setSubnodeOwner(
        bytes32 parentNode,
        bytes32 label,
        address owner
    )
        public
        override
        onlyTokenOwner(parentNode)
        canCallSetSubnodeOwner(parentNode, label)
        returns (bytes32)
    {
        return ens.setSubnodeOwner(parentNode, label, owner);
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
    ) public override returns (bytes32 node) {
        bytes32 labelhash = keccak256(bytes(label));
        node = _makeNode(parentNode, labelhash);
        bytes memory name = _addLabel(label, names[parentNode]);

        setSubnodeOwner(parentNode, labelhash, address(this));

        _wrap(node, name, newOwner, _fuses);
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
    ) public override {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = _makeNode(parentNode, labelhash);
        bytes memory name = _addLabel(label, names[parentNode]);

        setSubnodeRecord(parentNode, labelhash, address(this), resolver, ttl);

        _wrap(node, name, newOwner, _fuses);
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
    )
        public
        override
        onlyTokenOwner(node)
        operationAllowed(
            node,
            CANNOT_TRANSFER | CANNOT_SET_RESOLVER | CANNOT_SET_TTL
        )
    {
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
        onlyTokenOwner(node)
        operationAllowed(node, CANNOT_SET_RESOLVER)
    {
        ens.setResolver(node, resolver);
    }

    /**
     * @notice Sets TTL in the registry
     * @param node namehash of the name
     * @param ttl TTL in the registry
     */

    function setTTL(bytes32 node, uint64 ttl)
        public
        override
        onlyTokenOwner(node)
        operationAllowed(node, CANNOT_SET_TTL)
    {
        ens.setTTL(node, ttl);
    }

    /**
     * @dev Allows an operation only if none of the specified fuses are burned.
     * @param node The namehash of the name to check fuses on.
     * @param fuseMask A bitmask of fuses that must not be burned.
     */
    modifier operationAllowed(bytes32 node, uint96 fuseMask) {
        (, uint96 fuses) = getData(uint256(node));
        require(
            fuses & fuseMask == 0,
            "NameWrapper: Operation prohibited by fuses"
        );
        _;
    }

    /**
     * @notice Check whether a name can call setSubnodeOwner/setSubnodeRecord
     * @dev Checks both canCreateSubdomain and canReplaceSubdomain and whether not they have been burnt
     *      and checks whether the owner of the subdomain is 0x0 for creating or already exists for
     *      replacing a subdomain. If either conditions are true, then it is possible to call
     *      setSubnodeOwner
     * @param node namehash of the name to check
     * @param label labelhash of the name to check
     */

    modifier canCallSetSubnodeOwner(bytes32 node, bytes32 label) {
        bytes32 subnode = _makeNode(node, label);
        address owner = ens.owner(subnode);
        (, uint96 fuses) = getData(uint256(node));

        require(
            (owner == address(0) && fuses & CANNOT_CREATE_SUBDOMAIN == 0) ||
                (owner != address(0) && fuses & CANNOT_REPLACE_SUBDOMAIN == 0),
            "NameWrapper: Operation prohibited by fuses"
        );
        _;
    }

    /**
     * @notice Checks all Fuses in the mask are burned for the node
     * @param node namehash of the name
     * @param fuseMask the fuses you want to check
     * @return Boolean of whether or not all the selected fuses are burned
     */

    function allFusesBurned(bytes32 node, uint96 fuseMask)
        public
        view
        override
        returns (bool)
    {
        (, uint96 fuses) = getData(uint256(node));
        return fuses & fuseMask == fuseMask;
    }

    function onERC721Received(
        address to,
        address,
        uint256 tokenId,
        bytes calldata data
    ) public override returns (bytes4) {
        //check if it's the eth registrar ERC721
        require(
            msg.sender == address(registrar),
            "NameWrapper: Wrapper only supports .eth ERC721 token transfers"
        );

        (
            string memory label,
            address owner,
            uint96 fuses,
            address resolver
        ) = abi.decode(data, (string, address, uint96, address));

        bytes32 labelhash = bytes32(tokenId);

        require(
            keccak256(bytes(label)) == labelhash,
            "NameWrapper: Token id does match keccak(label) of label provided in data field"
        );

        // transfer the ens record back to the new owner (this contract)
        registrar.reclaim(uint256(labelhash), address(this));

        _wrapETH2LD(label, owner, fuses, resolver);

        return IERC721Receiver(to).onERC721Received.selector;
    }

    /***** Internal functions */

    function _canTransfer(uint96 fuses) internal pure override returns (bool) {
        return fuses & CANNOT_TRANSFER == 0;
    }

    function _makeNode(bytes32 node, bytes32 label)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(node, label));
    }

    function _addLabel(string memory label, bytes memory name)
        internal
        pure
        returns (bytes memory ret)
    {
        require(bytes(label).length > 0, "NameWrapper: Label too short");
        require(bytes(label).length < 256, "NameWrapper: Label too long");
        return abi.encodePacked(uint8(bytes(label).length), label, name);
    }

    function _mint(
        bytes32 node,
        address wrappedOwner,
        uint96 _fuses
    ) internal override {
        address oldWrappedOwner = ownerOf(uint256(node));
        if (oldWrappedOwner != address(0)) {
            // burn and unwrap old token of old owner
            _burn(uint256(node));
            emit NameUnwrapped(node, address(0));
        }
        super._mint(node, wrappedOwner, _fuses);
    }

    function _wrap(bytes32 node, bytes memory name, address wrappedOwner, uint96 fuses)
        internal
    {
        names[node] = name;

        _mint(node, wrappedOwner, fuses);

        emit NameWrapped(node, name, wrappedOwner, fuses);
    }

    function _wrapETH2LD(
        string memory label,
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) private returns (bytes32 labelhash) {
        labelhash = keccak256(bytes(label));
        bytes32 node = _makeNode(ETH_NODE, labelhash);
        bytes memory name = _addLabel(label, "\x03eth\x00");

        if (resolver != address(0)) {
            ens.setResolver(node, resolver);
        }

        // mint a new ERC1155 token with fuses
        _wrap(node, name, wrappedOwner, _fuses);
    }

    function _unwrap(bytes32 node, address newOwner) private {
        require(
            newOwner != address(0x0),
            "NameWrapper: Target owner cannot be 0x0"
        );
        require(
            newOwner != address(this),
            "NameWrapper: Target owner cannot be the NameWrapper contract"
        );
        require(
            !allFusesBurned(node, CANNOT_UNWRAP),
            "NameWrapper: Domain is not unwrappable"
        );

        // burn token and fuse data
        _burn(uint256(node));
        ens.setOwner(node, newOwner);

        emit NameUnwrapped(node, newOwner);
    }

    function _setData(
        uint256 tokenId,
        address owner,
        uint96 fuses
    ) internal override {
        require(
            fuses == CAN_DO_EVERYTHING || fuses & CANNOT_UNWRAP != 0,
            "NameWrapper: Cannot burn fuses: domain can be unwrapped"
        );
        super._setData(tokenId, owner, fuses);
    }

    /**
     * @dev Internal function that checks all a name's ancestors to ensure fuse values will be respected and parent controller/registrant are set to the Wrapper
     * @param name The name to check.
     * @param offset The offset into the name to start at.
     * @return node The calculated namehash for this part of the name.
     * @return vulnerability what kind of vulnerability the node has
     * @return vulnerableNode which node is at risk
     */
    function _checkHierarchy(bytes memory name, uint256 offset)
        internal
        view
        returns (
            bytes32 node,
            NameSafety vulnerability,
            bytes32 vulnerableNode
        )
    {
        // Read the first label. If it's the root, return immediately.
        (bytes32 labelhash, uint256 newOffset) = name.readLabel(offset);
        if (labelhash == bytes32(0)) {
            // Root node
            return (bytes32(0), NameSafety.Safe, 0);
        }

        // Check the parent name
        bytes32 parentNode;
        (parentNode, vulnerability, vulnerableNode) = _checkHierarchy(
            name,
            newOffset
        );

        node = _makeNode(parentNode, labelhash);

        // stop function checking any other nodes if a parent is not safe
        if (vulnerability != NameSafety.Safe) {
            return (node, vulnerability, vulnerableNode);
        }

        // Check the parent name's fuses to see if replacing subdomains is forbidden
        if (parentNode == ROOT_NODE) {
            // Save ourselves some gas; root node can't be replaced
            return (node, NameSafety.Safe, 0);
        }

        (vulnerability, vulnerableNode) = _checkOwnership(
            labelhash,
            node,
            parentNode
        );

        if (vulnerability != NameSafety.Safe) {
            return (node, vulnerability, vulnerableNode);
        }

        if (!allFusesBurned(parentNode, CANNOT_REPLACE_SUBDOMAIN)) {
            return (node, NameSafety.SubdomainReplacementAllowed, parentNode);
        }

        return (node, NameSafety.Safe, 0);
    }

    function _checkOwnership(
        bytes32 labelhash,
        bytes32 node,
        bytes32 parentNode
    ) internal view returns (NameSafety vulnerability, bytes32 vulnerableNode) {
        if (parentNode == ETH_NODE) {
            // Special case .eth: Check registrant or name isexpired

            try registrar.ownerOf(uint256(labelhash)) returns (
                address registrarOwner
            ) {
                if (registrarOwner != address(this)) {
                    return (NameSafety.RegistrantNotWrapped, node);
                }
            } catch {
                return (NameSafety.Expired, node);
            }
        }

        if (ens.owner(node) != address(this)) {
            return (NameSafety.ControllerNotWrapped, node);
        }
        return (NameSafety.Safe, 0);
    }
}
