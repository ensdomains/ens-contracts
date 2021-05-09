import "./ERC1155.sol";
import "../interfaces/ENS.sol";
import "../interfaces/BaseRegistrar.sol";
import "../interfaces/Resolver.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./BytesUtil.sol";
import "hardhat/console.sol";

contract NFTFuseWrapper is ERC1155 {
    using BytesUtils for bytes;
    ENS public ens;
    BaseRegistrar public registrar;
    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;

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

    /**************************************************************************
     * Wrapper
     *************************************************************************/

    function makeNode(bytes32 node, bytes32 label)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(node, label));
    }

    modifier ownerOnly(bytes32 node) {
        require(
            isOwnerOrApproved(node, msg.sender),
            "NFTFuseWrapper: msg.sender is not the owner or approved"
        );
        _;
    }

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

    function getFuses(bytes32 node) public view returns (uint96) {
        (, uint96 fuses) = getData(uint256(node));
        return fuses;
    }

    function canUnwrap(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_UNWRAP == 0;
    }

    function canBurnFuses(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_BURN_FUSES == 0;
    }

    function canTransfer(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_TRANSFER == 0;
    }

    function canSetData(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_SET_DATA == 0;
    }

    function canCreateSubdomain(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_CREATE_SUBDOMAIN == 0;
    }

    function canReplaceSubdomain(bytes32 node) public view returns (bool) {
        uint96 fuses = getFuses(node);
        return fuses & CANNOT_REPLACE_SUBDOMAIN == 0;
    }

    function canCallSetSubnodeOwner(bytes32 node, bytes32 label)
        public
        returns (bool)
    {
        bytes32 subnode = makeNode(node, label);
        address owner = ens.owner(subnode);

        return
            (owner == address(0) && canCreateSubdomain(node)) ||
            (owner != address(0) && canReplaceSubdomain(node));
    }

    function _mint(
        uint256 tokenId,
        address newOwner,
        uint96 fuses
    ) private {
        address owner = ownerOf(tokenId);
        require(owner == address(0), "ERC1155: mint of existing token");
        require(newOwner != address(0), "ERC1155: mint to the zero address");
        setData(tokenId, newOwner, fuses);
        emit TransferSingle(msg.sender, owner, address(0x0), tokenId, 1);
    }

    function _burn(uint256 tokenId) internal {
        address owner = ownerOf(tokenId);
        // Clear fuses and set owner to 0
        setData(tokenId, address(0x0), 0);
        emit TransferSingle(msg.sender, owner, address(0x0), tokenId, 1);
    }

    function wrapETH2LD(
        string calldata label,
        uint96 _fuses,
        address wrappedOwner
    ) public override {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = makeNode(ETH_NODE, labelhash);
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

    function _wrapETH2LD(
        bytes32 label,
        bytes32 node,
        uint96 _fuses,
        address wrappedOwner
    ) private {
        // transfer the ens record back to the new owner (this contract)
        registrar.reclaim(uint256(label), address(this));
        // mint a new ERC1155 token with fuses
        _mint(uint256(node), wrappedOwner, _fuses);

        if (_fuses != CAN_DO_EVERYTHING) {
            require(
                !canUnwrap(node),
                "NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped"
            );
        }

        emit WrapETH2LD(label, _fuses, wrappedOwner);
    }

    function wrap(
        bytes32 parentNode,
        string calldata label,
        uint96 _fuses,
        address wrappedOwner
    ) public override {
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = makeNode(parentNode, labelhash);
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

        bytes32 node = makeNode(parentNode, label);

        _mint(uint256(node), wrappedOwner, _fuses);

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
    }

    function unwrap(
        bytes32 parentNode,
        bytes32 label,
        address owner
    ) public override ownerOnly(makeNode(parentNode, label)) {
        require(
            parentNode != ETH_NODE,
            "NFTFuseWrapper: .eth names must be unwrapped with unwrapETH2LD()"
        );
        _unwrap(parentNode, label, owner);
    }

    function _unwrap(
        bytes32 parentNode,
        bytes32 label,
        address owner
    ) internal {
        bytes32 node = makeNode(parentNode, label);
        require(
            owner != address(0x0),
            "NFTFuseWrapper: Target owner cannot be 0x0"
        );
        require(
            owner != address(this),
            "NFTFuseWrapper: Target owner cannot be the NFTFuseWrapper contract"
        );
        require(canUnwrap(node), "NFTFuseWrapper: Domain is not unwrappable");

        // burn token and fuse data
        _burn(uint256(node));
        ens.setOwner(node, owner);
        emit Unwrap(parentNode, label, owner);
    }

    function unwrapETH2LD(bytes32 label, address newOwner)
        public
        ownerOnly(makeNode(ETH_NODE, label))
    {
        _unwrap(ETH_NODE, label, newOwner);
        registrar.transferFrom(address(this), newOwner, uint256(label));
    }

    function burnFuses(
        bytes32 parentNode,
        bytes32 label,
        uint96 _fuses
    ) public ownerOnly(makeNode(parentNode, label)) {
        bytes32 node = makeNode(parentNode, label);

        require(
            canBurnFuses(node),
            "NFTFuseWrapper: Fuse has been burned for burning fuses"
        );

        // check that the parent has the CAN_REPLACE_SUBDOMAIN fuse burned, and the current domain has the CAN_UNWRAP fuse burned

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

    function setRecord(
        bytes32 node,
        address owner,
        address resolver,
        uint64 ttl
    ) external {
        require(
            canTransfer(node),
            "NFTFuseWrapper: Fuse is burned for transferring"
        );
        require(
            canSetData(node),
            "NFTFuseWrapper: Fuse is burned for setting data"
        );
        ens.setRecord(node, owner, resolver, ttl);
    }

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address addr,
        address resolver,
        uint64 ttl
    ) public ownerOnly(node) {
        require(
            canCallSetSubnodeOwner(node, label),
            "NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain"
        );

        return ens.setSubnodeRecord(node, label, addr, resolver, ttl);
    }

    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address newOwner
    ) public override ownerOnly(node) returns (bytes32) {
        require(
            canCallSetSubnodeOwner(node, label),
            "NFTFuseWrapper: Fuse has been burned for creating or replacing a subdomain"
        );

        ens.setSubnodeOwner(node, label, newOwner);
    }

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

    function setResolver(bytes32 node, address resolver)
        public
        override
        ownerOnly(node)
    {
        require(
            canSetData(node),
            "NFTFuseWrapper: Fuse already burned for setting resolver"
        );
        ens.setResolver(node, resolver);
    }

    function setTTL(bytes32 node, uint64 ttl) public ownerOnly(node) {
        require(
            canSetData(node),
            "NFTFuseWrapper: Fuse already burned for setting TTL"
        );
        ens.setTTL(node, ttl);
    }

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
            fuses = uint96(data.readUint96(0));
        }

        bytes32 node = makeNode(ETH_NODE, bytes32(tokenId));
        _wrapETH2LD(bytes32(tokenId), node, fuses, from);
        emit WrapETH2LD(bytes32(tokenId), fuses, from);
        return _ERC721_RECEIVED;
    }
}
