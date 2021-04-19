import "../interfaces/ENS.sol";
import "../interfaces/BaseRegistrar.sol";
import "../interfaces/Resolver.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../interfaces/INFTFuseWrapper.sol";
import "hardhat/console.sol";

contract NFTFuseWrapper is INFTFuseWrapper, ERC165 {
    using Address for address;
    ENS public ens;
    BaseRegistrar public registrar;
    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;

    bytes32 public constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;
    bytes32 public constant ROOT_NODE =
        0x0000000000000000000000000000000000000000000000000000000000000000;

    mapping(uint256 => uint256) public _tokens;

    // Mapping from owner to operator approvals
    mapping(address => mapping(address => bool)) private _operatorApprovals;

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
     * ERC721 methods
     *************************************************************************/

    function ownerOf(uint256 id) public view override returns (address) {
        (address owner, ) = getData(id);
        return owner;
    }

    //TODO: update OZ to get this working

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC1155MetadataURI).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {IERC1155Metadata-uri}.
     */
    function uri(uint256) public view virtual override returns (string memory) {
        return "";
    }

    /**
     * @dev See {IERC1155-balanceOf}.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function balanceOf(address account, uint256 id)
        public
        view
        virtual
        override
        returns (uint256)
    {
        require(
            account != address(0),
            "ERC1155: balance query for the zero address"
        );
        (address owner, ) = getData(id);
        if (owner == account) {
            return 1;
        }
        return 0;
    }

    /**
     * @dev See {IERC1155-balanceOfBatch}.
     *
     * Requirements:
     *
     * - `accounts` and `ids` must have the same length.
     */
    function balanceOfBatch(address[] memory accounts, uint256[] memory ids)
        public
        view
        virtual
        override
        returns (uint256[] memory)
    {
        require(
            accounts.length == ids.length,
            "ERC1155: accounts and ids length mismatch"
        );

        uint256[] memory batchBalances = new uint256[](accounts.length);

        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = balanceOf(accounts[i], ids[i]);
        }

        return batchBalances;
    }

    /**
     * @dev See {IERC1155-setApprovalForAll}.
     */
    function setApprovalForAll(address operator, bool approved)
        public
        virtual
        override
    {
        require(
            msg.sender != operator,
            "ERC1155: setting approval status for self"
        );

        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(address account, address operator)
        public
        view
        virtual
        override
        returns (bool)
    {
        return _operatorApprovals[account][operator];
    }

    /**
     * @dev Returns the Name's owner address and fuses
     */
    function getData(uint256 tokenId)
        public
        view
        override
        returns (address owner, uint96 fuses)
    {
        uint256 t = _tokens[tokenId];
        owner = address(uint160(t));
        fuses = uint96(t >> 160);
    }

    /**
     * @dev Sets the Name's owner address and fuses
     */
    function setData(
        uint256 tokenId,
        address owner,
        uint96 fuses
    ) internal {
        _tokens[tokenId] = uint256(uint160(owner)) | (uint256(fuses) << 160);
    }

    /**
     * @dev See {IERC1155-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        require(to != address(0), "ERC1155: transfer to the zero address");
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "ERC1155: caller is not owner nor approved"
        );

        (address oldOwner, uint96 fuses) = getData(id);
        require(
            fuses & CANNOT_TRANSFER == 0,
            "NFTFuseWrapper: Fuse already burned for setting owner"
        );
        require(
            amount == 1 && oldOwner == from,
            "ERC1155: Insufficient balance for transfer"
        );
        setData(id, to, fuses);

        emit TransferSingle(msg.sender, from, to, id, amount);

        _doSafeTransferAcceptanceCheck(msg.sender, from, to, id, amount, data);
    }

    /**
     * @dev See {IERC1155-safeBatchTransferFrom}.
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override {
        require(
            ids.length == amounts.length,
            "ERC1155: ids and amounts length mismatch"
        );
        require(to != address(0), "ERC1155: transfer to the zero address");
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "ERC1155: transfer caller is not owner nor approved"
        );

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            (address oldOwner, uint96 fuses) = getData(id);
            require(
                fuses & CANNOT_TRANSFER == 0,
                "NFTFuseWrapper: Fuse already burned for setting owner"
            );
            require(
                amount == 1 && oldOwner == from,
                "ERC1155: insufficient balance for transfer"
            );
            setData(id, to, fuses);
        }

        emit TransferBatch(msg.sender, from, to, ids, amounts);

        _doSafeBatchTransferAcceptanceCheck(
            msg.sender,
            from,
            to,
            ids,
            amounts,
            data
        );
    }

    /**************************************************************************
     * Internal/private methods
     *************************************************************************/

    function _doSafeTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private {
        if (to.isContract()) {
            try
                IERC1155Receiver(to).onERC1155Received(
                    operator,
                    from,
                    id,
                    amount,
                    data
                )
            returns (bytes4 response) {
                if (
                    response != IERC1155Receiver(to).onERC1155Received.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }

    function _doSafeBatchTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) private {
        if (to.isContract()) {
            try
                IERC1155Receiver(to).onERC1155BatchReceived(
                    operator,
                    from,
                    ids,
                    amounts,
                    data
                )
            returns (bytes4 response) {
                if (
                    response !=
                    IERC1155Receiver(to).onERC1155BatchReceived.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
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

    function canUnwrap(bytes32 node) public view returns (bool) {
        (, uint96 fuses) = getData(uint256(node));
        return fuses & CANNOT_UNWRAP == 0;
    }

    function canTransfer(bytes32 node) public view returns (bool) {
        (, uint96 fuses) = getData(uint256(node));
        return fuses & CANNOT_TRANSFER == 0;
    }

    function canSetData(bytes32 node) public view returns (bool) {
        (, uint96 fuses) = getData(uint256(node));
        return fuses & CANNOT_SET_DATA == 0;
    }

    function canCreateSubdomain(bytes32 node) public view returns (bool) {
        (, uint96 fuses) = getData(uint256(node));
        return fuses & CANNOT_CREATE_SUBDOMAIN == 0;
    }

    function canReplaceSubdomain(bytes32 node) public view returns (bool) {
        (, uint96 fuses) = getData(uint256(node));
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
    ) public {
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
        address owner = ens.owner(node);

        // TODO: test account a creates a name, authorised wrapper, account b tries to do something with thename
        require(
            owner == msg.sender ||
                ens.isApprovedForAll(owner, msg.sender) ||
                isApprovedForAll(owner, msg.sender),
            "NFTFuseWrapper: Domain is not owned by the sender"
        );

        // transfer the token from the user to this contract
        address currentOwner = registrar.ownerOf(tokenId);
        registrar.transferFrom(currentOwner, address(this), tokenId);

        // transfer the ens record back to the new owner (this contract)
        _wrapETH2LD(labelhash, node, _fuses, wrappedOwner);

        emit Wrap(ETH_NODE, label, _fuses, owner);
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
        emit Wrap(parentNode, label, _fuses, owner);
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

    function unwrap(bytes32 node, address owner)
        public
        override
        ownerOnly(node)
    {
        require(owner != address(0x0));
        require(canUnwrap(node), "NFTFuseWrapper: Domain is not unwrappable");

        // burn token and fuse data
        _burn(uint256(node));
        ens.setOwner(node, owner);
    }

    function unwrapETH2LD(bytes32 label, address owner) public {
        //unwrap checks ownerOnly so no need to add separate modifier
        unwrap(makeNode(ETH_NODE, label), owner);
        //transfer back original ERC721 to owner
        registrar.transferFrom(address(this), owner, uint256(label));
    }

    function burnFuses(
        bytes32 parentNode,
        bytes32 label,
        uint96 _fuses
    ) public ownerOnly(makeNode(parentNode, label)) {
        bytes32 node = makeNode(parentNode, label);

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
        bytes32 node,
        bytes32 label,
        address newOwner,
        uint96 _fuses
    ) public override returns (bytes32) {
        setSubnodeOwner(node, label, address(this));
        _wrap(node, label, _fuses, newOwner);
    }

    function setSubnodeRecordAndWrap(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl,
        uint96 _fuses
    ) public override returns (bytes32) {
        setSubnodeRecord(node, label, address(this), resolver, ttl);
        _wrap(node, label, _fuses, owner);
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
        require(
            msg.sender == address(registrar),
            "NFTFuseWrapper: Wrapper only supports .eth ERC721 token transfers"
        );

        bytes32 node = makeNode(ETH_NODE, bytes32(tokenId));
        _wrapETH2LD(bytes32(tokenId), node, uint96(0), from);
        return _ERC721_RECEIVED;
    }
}
