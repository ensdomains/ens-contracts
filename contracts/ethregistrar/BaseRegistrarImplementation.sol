pragma solidity >=0.8.4;

import "../registry/ENS.sol";
import "./IBaseRegistrar.sol";
import "./IMetadataRenderer.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @dev INVARIANT (ERC721Enumerable): enumeration (`totalSupply`,
///      `tokenByIndex`, `balanceOf`, `tokenOfOwnerByIndex`) is maintained on
///      transfer/mint/burn, NOT on expiry — a name is only burned when it is
///      re-registered after its grace period. So enumeration includes
///      expired-but-unburned names and can disagree with the grace-period
///      `ownerOf` (which reverts once expired). Readers MUST filter by
///      `nameExpires(id) > block.timestamp` to get the live set.
contract BaseRegistrarImplementation is
    ERC721Enumerable,
    IBaseRegistrar,
    Ownable
{
    // A map of expiry times
    mapping(uint256 => uint256) expiries;
    // labelhash (tokenId) => plaintext label, recorded write-once by registerWithLabel.
    mapping(uint256 => string) public labelOf;
    // Swappable on-chain metadata renderer; tokenURI delegates here.
    address public metadataRenderer;
    // Max label byte-length accepted by registerWithLabel; 0 = no limit. Set at
    // deployment (and adjustable by the owner) as a per-TLD policy knob.
    uint256 public maxLabelLength;
    // The ENS registry
    ENS public ens;
    // The namehash of the TLD this registrar owns (eg, .eth)
    bytes32 public baseNode;
    // A map of addresses that are authorised to register and renew names.
    mapping(address => bool) public controllers;
    uint256 public constant GRACE_PERIOD = 90 days;
    bytes4 private constant INTERFACE_META_ID =
        bytes4(keccak256("supportsInterface(bytes4)"));
    bytes4 private constant RECLAIM_ID =
        bytes4(keccak256("reclaim(uint256,address)"));

    event MetadataRendererChanged(address indexed renderer);
    event MaxLabelLengthChanged(uint256 maxLabelLength);

    error LabelTooLong(uint256 length, uint256 max);

    /// v2.1.3 version of _isApprovedOrOwner which calls ownerOf(tokenId) and takes grace period into consideration instead of ERC721.ownerOf(tokenId);
    /// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.1.3/contracts/token/ERC721/ERC721.sol#L187
    /// @dev Returns whether the given spender can transfer a given token ID
    /// @param spender address of the spender to query
    /// @param tokenId uint256 ID of the token to be transferred
    /// @return bool whether the msg.sender is approved for the given token ID,
    ///              is an operator of the owner, or is the owner of the token
    function _isApprovedOrOwner(
        address spender,
        uint256 tokenId
    ) internal view override returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner ||
            getApproved(tokenId) == spender ||
            isApprovedForAll(owner, spender));
    }

    constructor(
        ENS _ens,
        bytes32 _baseNode
    ) ERC721("SimpleX Names", "SIMPLEX") {
        ens = _ens;
        baseNode = _baseNode;
    }

    modifier live() {
        require(ens.owner(baseNode) == address(this));
        _;
    }

    modifier onlyController() {
        require(controllers[msg.sender]);
        _;
    }

    /// @dev Gets the owner of the specified token ID. Names become unowned
    ///      when their registration expires.
    /// @param tokenId uint256 ID of the token to query the owner of
    /// @return address currently marked as the owner of the given token ID
    function ownerOf(
        uint256 tokenId
    ) public view override(IERC721, ERC721) returns (address) {
        require(expiries[tokenId] > block.timestamp);
        return super.ownerOf(tokenId);
    }

    // Authorises a controller, who can register and renew domains.
    function addController(address controller) external override onlyOwner {
        controllers[controller] = true;
        emit ControllerAdded(controller);
    }

    // Revoke controller permission for an address.
    function removeController(address controller) external override onlyOwner {
        controllers[controller] = false;
        emit ControllerRemoved(controller);
    }

    // Set the resolver for the TLD this registrar manages.
    function setResolver(address resolver) external override onlyOwner {
        ens.setResolver(baseNode, resolver);
    }

    // Returns the expiration timestamp of the specified id.
    function nameExpires(uint256 id) external view override returns (uint256) {
        return expiries[id];
    }

    // Returns true iff the specified name is available for registration.
    function available(uint256 id) public view override returns (bool) {
        // Not available if it's registered here or in its grace period.
        return expiries[id] + GRACE_PERIOD < block.timestamp;
    }

    /// @dev Register a name.
    /// @param id The token ID (keccak256 of the label).
    /// @param owner The address that should own the registration.
    /// @param duration Duration in seconds for the registration.
    function register(
        uint256 id,
        address owner,
        uint256 duration
    ) external override returns (uint256) {
        return _register(id, owner, duration, true);
    }

    /// @dev Register a name from its plaintext label, recording the label
    ///      on-chain (write-once) so hash->name resolves without an indexer.
    ///      This is the SNRC registration path; the low-level register(uint256)
    ///      above does NOT record a label and exists only for the upstream
    ///      IBaseRegistrar interface (eg NameWrapper).
    /// @param label The plaintext label (eg "alice").
    /// @param owner The address that should own the registration.
    /// @param duration Duration in seconds for the registration.
    function registerWithLabel(
        string calldata label,
        address owner,
        uint256 duration
    ) external returns (uint256) {
        if (maxLabelLength != 0 && bytes(label).length > maxLabelLength)
            revert LabelTooLong(bytes(label).length, maxLabelLength);
        uint256 id = uint256(keccak256(bytes(label)));
        if (bytes(labelOf[id]).length == 0) {
            labelOf[id] = label;
        }
        return _register(id, owner, duration, true);
    }

    /// @dev Register a name, without modifying the registry.
    /// @param id The token ID (keccak256 of the label).
    /// @param owner The address that should own the registration.
    /// @param duration Duration in seconds for the registration.
    function registerOnly(
        uint256 id,
        address owner,
        uint256 duration
    ) external returns (uint256) {
        return _register(id, owner, duration, false);
    }

    function _register(
        uint256 id,
        address owner,
        uint256 duration,
        bool updateRegistry
    ) internal live onlyController returns (uint256) {
        require(available(id));
        require(
            block.timestamp + duration + GRACE_PERIOD >
                block.timestamp + GRACE_PERIOD
        ); // Prevent future overflow

        expiries[id] = block.timestamp + duration;
        if (_exists(id)) {
            // Name was previously owned, and expired
            _burn(id);
        }
        _mint(owner, id);
        if (updateRegistry) {
            ens.setSubnodeOwner(baseNode, bytes32(id), owner);
        }

        emit NameRegistered(id, owner, block.timestamp + duration);

        return block.timestamp + duration;
    }

    function renew(
        uint256 id,
        uint256 duration
    ) external override live onlyController returns (uint256) {
        require(expiries[id] + GRACE_PERIOD >= block.timestamp); // Name must be registered here or in grace period
        require(
            expiries[id] + duration + GRACE_PERIOD > duration + GRACE_PERIOD
        ); // Prevent future overflow

        expiries[id] += duration;
        emit NameRenewed(id, expiries[id]);
        return expiries[id];
    }

    /// @dev Reclaim ownership of a name in ENS, if you own it in the registrar.
    function reclaim(uint256 id, address owner) external override live {
        require(_isApprovedOrOwner(msg.sender, id));
        ens.setSubnodeOwner(baseNode, bytes32(id), owner);
    }

    // Sets the on-chain metadata renderer that tokenURI delegates to.
    function setMetadataRenderer(address renderer) external onlyOwner {
        metadataRenderer = renderer;
        emit MetadataRendererChanged(renderer);
    }

    // Sets the max label byte-length for registerWithLabel; 0 = no limit.
    function setMaxLabelLength(uint256 newMax) external onlyOwner {
        maxLabelLength = newMax;
        emit MaxLabelLengthChanged(newMax);
    }

    /// @dev ERC-721 metadata. Delegates to the swappable renderer, passing the
    ///      stored plaintext label so the NFT title is the domain name.
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireMinted(tokenId);
        if (metadataRenderer == address(0)) return "";
        return
            IMetadataRenderer(metadataRenderer).tokenURI(
                tokenId,
                labelOf[tokenId]
            );
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC721Enumerable, IERC165) returns (bool) {
        return
            interfaceID == INTERFACE_META_ID ||
            interfaceID == RECLAIM_ID ||
            super.supportsInterface(interfaceID);
    }
}
