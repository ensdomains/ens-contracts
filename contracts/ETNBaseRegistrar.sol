// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ETNRegistry.sol";
import "./ETNNamehash.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.2/contracts/token/ERC721/ERC721.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.2/contracts/utils/Base64.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.2/contracts/utils/Strings.sol";

interface IETNResolver {
    function setAddr(bytes32 node, address _addr) external;
}

interface IUniswapV2Router {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function WETH() external pure returns (address);
}

interface IERC20Burnable {
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80  roundId,
        int256  answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80  answeredInRound
    );
    function decimals() external view returns (uint8);
}

/**
 * @title ETNBaseRegistrar
 * @notice Registers .etn (basic) and .project.etn (project) names as ERC-721
 *         NFTs. Owning the NFT IS owning the name.
 *
 *  IMPORTANT ARCHITECTURE NOTE (fixed bug):
 *    The _update() hook automatically calls registry.setOwner(node, to) on
 *    every mint/transfer, WHILE the registrar still holds registry authority
 *    over the parent node from the preceding setSubnodeOwner call. Do NOT
 *    also call registry.setOwner() explicitly before minting — that hands
 *    away authority too early, causing the hook's own internal setOwner
 *    call to revert with "ETNRegistry: not authorised". Mint first; let the
 *    hook handle registry sync.
 */
contract ETNBaseRegistrar is ERC721 {

    using ETNNamehash for bytes32;
    using Strings for uint256;

    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────

    uint256 public constant LEASE_DURATION = 365 days;
    uint256 public constant GRACE_PERIOD   = 30 days;
    uint256 public constant MAX_ORACLE_AGE = 1 hours;

    uint8 internal constant TYPE_BASIC        = 0;
    uint8 internal constant TYPE_PROJECT_NAME = 1;
    uint8 internal constant TYPE_NAMESPACE    = 2;

    // New state — adjustable project-name fee split (in basis points out of 100)
    uint256 public projectNameOwnerSharePercent = 80;
    uint256 public projectNameBurnSharePercent = 10;
    // remaining (100 - owner - burn) goes to platform fees

    event ProjectNameSplitUpdated(uint256 ownerPercent, uint256 burnPercent, uint256 platformPercent);

    // ─────────────────────────────────────────────
    //  USD target prices (6 decimals)
    // ─────────────────────────────────────────────

    uint256 public basicYearUsdPrice          = 10_000000;
    uint256 public basicLifetimeUsdPrice      = 25_000000;
    uint256 public projectYearUsdPrice        = 10_000000;
    uint256 public projectLifetimeUsdPrice    = 25_000000;
    uint256 public namespaceYearUsdPrice      = 500_000000;
    uint256 public namespaceLifetimeUsdPrice  = 1250_000000;

    // ─────────────────────────────────────────────
    //  Fallback ETN prices
    // ─────────────────────────────────────────────

    uint256 public fallbackBasicYearPrice         = 5_000 * 1e18;
    uint256 public fallbackBasicLifetimePrice     = 25_000 * 1e18;
    uint256 public fallbackProjectYearPrice       = 5_000 * 1e18;
    uint256 public fallbackProjectLifetimePrice   = 25_000 * 1e18;
    uint256 public fallbackNamespaceYearPrice     = 100_000 * 1e18;
    uint256 public fallbackNamespaceLifetimePrice = 250_000 * 1e18;

    // ─────────────────────────────────────────────
    //  Immutables
    // ─────────────────────────────────────────────

    ETNRegistry      public immutable registry;
    IUniswapV2Router public immutable router;
    address          public immutable WETN;

    // ─────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────

    address public owner;
    address public coreToken;
    address public defaultResolver;

    address public imageOperator;

    mapping(bytes32 => string) public nodeImageURI;
    string public placeholderImageURI;

    AggregatorV3Interface public priceFeed;

    mapping(bytes32 => uint256) public expiresAt;
    mapping(bytes32 => uint8) public nodeType;
    mapping(bytes32 => string) public fullName;
    mapping(bytes32 => string) public parentProject;

    mapping(bytes32 => bool)    public projectExists;
    mapping(bytes32 => address) public projectCreator;
    mapping(bytes32 => uint256) public projectExpiresAt;
// New state — per-namespace, per-duration pricing
    mapping(bytes32 => uint256) public namespaceProjectYearPrice;     // projectNode => price in wei, 0 = use fallback
    mapping(bytes32 => uint256) public namespaceProjectLifetimePrice; // projectNode => price in wei, 0 = use fallback

    mapping(address => uint256) public ownerAccruedFees; // namespace owner => withdrawable balance

    event NamespacePriceUpdated(bytes32 indexed projectNode, uint256 yearPrice, uint256 lifetimePrice);
    event NamespaceFeesWithdrawn(address indexed owner, uint256 amount);
    
    uint256 public accruedFees;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event NameRegistered(
        bytes32 indexed node,
        string  name,
        string  tld,
        address indexed registrant,
        bool    lifetime,
        uint256 expiresAt
    );
    event NameRenewed(bytes32 indexed node, uint256 newExpiry);
    event ProjectCreated(
        string project,
        bytes32 indexed projectNode,
        address indexed creator,
        bool lifetime,
        uint256 expiresAt
    );
    event ProjectRenewed(bytes32 indexed projectNode, uint256 newExpiry);
    event CoreBurned          (uint256 etnIn, uint256 coreBurned);
    event ResolverUpdated     (address resolver);
    event CoreTokenUpdated    (address token);
    event PriceFeedUpdated    (address feed);
    event NodeImageUpdated     (bytes32 indexed node, string uri);
    event PlaceholderImageUpdated(string uri);
    event UsdPricesUpdated    (string tier, uint256 yearUsd, uint256 lifetimeUsd);
    event FallbackPricesUpdated(string tier, uint256 yearEtn, uint256 lifetimeEtn);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event FeesWithdrawn       (address to, uint256 amount);

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "ETNRegistrar: not owner");
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    constructor(
        address _registry,
        address _router,
        address _WETN,
        address _coreToken,
        address _defaultResolver
    ) ERC721("Planet Zephyros - Electroneum Name Service", "PZENS") {
        registry        = ETNRegistry(_registry);
        router          = IUniswapV2Router(_router);
        WETN            = _WETN;
        coreToken       = _coreToken;
        defaultResolver = _defaultResolver;
        owner           = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  Pricing — read
    // ─────────────────────────────────────────────

    function getBasicYearPrice() public view returns (uint256) {
        return _usdToEtn(basicYearUsdPrice, fallbackBasicYearPrice);
    }

    function getBasicLifetimePrice() public view returns (uint256) {
        return _usdToEtn(basicLifetimeUsdPrice, fallbackBasicLifetimePrice);
    }

    function getProjectNameYearPrice() public view returns (uint256) {
        return _usdToEtn(projectYearUsdPrice, fallbackProjectYearPrice);
    }

    function getProjectNameLifetimePrice() public view returns (uint256) {
        return _usdToEtn(projectLifetimeUsdPrice, fallbackProjectLifetimePrice);
    }

    function getNamespaceYearPrice() public view returns (uint256) {
        return _usdToEtn(namespaceYearUsdPrice, fallbackNamespaceYearPrice);
    }

    function getNamespaceLifetimePrice() public view returns (uint256) {
        return _usdToEtn(namespaceLifetimeUsdPrice, fallbackNamespaceLifetimePrice);
    }

    function getOraclePrice() public view returns (uint256 etnUsd, bool valid) {
        if (address(priceFeed) == address(0)) return (0, false);
        try priceFeed.latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            if (answer > 0 && block.timestamp - updatedAt <= MAX_ORACLE_AGE) {
                return (uint256(answer), true);
            }
        } catch {}
        return (0, false);
    }

    // ─────────────────────────────────────────────
    //  Admin — pricing
    // ─────────────────────────────────────────────

    function setBasicUsdPrices(uint256 _year, uint256 _lifetime) external onlyOwner {
        require(_year > 0 && _lifetime > 0, "ETNRegistrar: zero price");
        basicYearUsdPrice     = _year;
        basicLifetimeUsdPrice = _lifetime;
        emit UsdPricesUpdated("basic", _year, _lifetime);
    }

    function setProjectNameUsdPrices(uint256 _year, uint256 _lifetime) external onlyOwner {
        require(_year > 0 && _lifetime > 0, "ETNRegistrar: zero price");
        projectYearUsdPrice     = _year;
        projectLifetimeUsdPrice = _lifetime;
        emit UsdPricesUpdated("project-name", _year, _lifetime);
    }

    function setNamespaceUsdPrices(uint256 _year, uint256 _lifetime) external onlyOwner {
        require(_year > 0 && _lifetime > 0, "ETNRegistrar: zero price");
        namespaceYearUsdPrice     = _year;
        namespaceLifetimeUsdPrice = _lifetime;
        emit UsdPricesUpdated("namespace", _year, _lifetime);
    }

    function setBasicFallbackPrices(uint256 _year, uint256 _lifetime) external onlyOwner {
        require(_year > 0 && _lifetime > 0, "ETNRegistrar: zero price");
        fallbackBasicYearPrice     = _year;
        fallbackBasicLifetimePrice = _lifetime;
        emit FallbackPricesUpdated("basic", _year, _lifetime);
    }

    function setProjectNameFallbackPrices(uint256 _year, uint256 _lifetime) external onlyOwner {
        require(_year > 0 && _lifetime > 0, "ETNRegistrar: zero price");
        fallbackProjectYearPrice     = _year;
        fallbackProjectLifetimePrice = _lifetime;
        emit FallbackPricesUpdated("project-name", _year, _lifetime);
    }

    function setNamespaceFallbackPrices(uint256 _year, uint256 _lifetime) external onlyOwner {
        require(_year > 0 && _lifetime > 0, "ETNRegistrar: zero price");
        fallbackNamespaceYearPrice     = _year;
        fallbackNamespaceLifetimePrice = _lifetime;
        emit FallbackPricesUpdated("namespace", _year, _lifetime);
    }

    function setPriceFeed(address _feed) external onlyOwner {
        priceFeed = AggregatorV3Interface(_feed);
        emit PriceFeedUpdated(_feed);
    }

function setNamespacePrice(
    string calldata project,
    uint256 yearPrice,
    uint256 lifetimePrice
) external {
    bytes32 labelHash = keccak256(bytes(project));
    require(projectCreator[labelHash] == msg.sender, "ETNRegistrar: not namespace owner");
    require(yearPrice >= fallbackProjectYearPrice, "ETNRegistrar: below floor");
    require(lifetimePrice >= fallbackProjectLifetimePrice, "ETNRegistrar: below floor");

    bytes32 projectNode = keccak256(abi.encodePacked(ETNNamehash.ETN_NODE, labelHash));
    namespaceProjectYearPrice[projectNode] = yearPrice;
    namespaceProjectLifetimePrice[projectNode] = lifetimePrice;

    emit NamespacePriceUpdated(projectNode, yearPrice, lifetimePrice);
}

function withdrawNamespaceFees() external {
    uint256 amount = ownerAccruedFees[msg.sender];
    require(amount > 0, "ETNRegistrar: nothing to withdraw");
    ownerAccruedFees[msg.sender] = 0;
    (bool ok, ) = payable(msg.sender).call{value: amount}("");
    require(ok, "ETNRegistrar: transfer failed");
    emit NamespaceFeesWithdrawn(msg.sender, amount);
}


    // ─────────────────────────────────────────────
    //  Admin — general
    // ─────────────────────────────────────────────

    function approveRegistryNode() external onlyOwner {
        registry.setApprovalForAll(ETNNamehash.ETN_NODE, address(this), true);
    }

    function setCoreToken(address _token) external onlyOwner {
        coreToken = _token;
        emit CoreTokenUpdated(_token);
    }

    function setDefaultResolver(address _resolver) external onlyOwner {
        defaultResolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    function setNodeImage(bytes32 node, string calldata uri) external {
        require(
            msg.sender == owner || msg.sender == imageOperator,
            "ETNRegistrar: not authorised"
        );
        nodeImageURI[node] = uri;
        emit NodeImageUpdated(node, uri);
    }

    function setPlaceholderImage(string calldata uri) external onlyOwner {
        placeholderImageURI = uri;
        emit PlaceholderImageUpdated(uri);
    }

    function setImageOperator(address _operator) external onlyOwner {
        imageOperator = _operator;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ETNRegistrar: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function withdrawFees(address payable to) external onlyOwner {
        uint256 amount = accruedFees;
        accruedFees = 0;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETNRegistrar: transfer failed");
        emit FeesWithdrawn(to, amount);
    }

    function setProjectNameSplit(uint256 ownerPercent, uint256 burnPercent) external onlyOwner {
        require(ownerPercent + burnPercent <= 100, "ETNRegistrar: split exceeds 100%");
        projectNameOwnerSharePercent = ownerPercent;
        projectNameBurnSharePercent = burnPercent;
        emit ProjectNameSplitUpdated(ownerPercent, burnPercent, 100 - ownerPercent - burnPercent);
    }

    // ─────────────────────────────────────────────
    //  Availability helpers
    // ─────────────────────────────────────────────

    function _isAvailable(bytes32 node) internal view returns (bool) {
        uint256 tokenId = uint256(node);
        if (_ownerOf(tokenId) == address(0)) return true;

        uint256 expiry = expiresAt[node];
        if (expiry == 0) return false;

        return block.timestamp > expiry + GRACE_PERIOD;
    }

    function _inGracePeriod(bytes32 node) internal view returns (bool) {
        uint256 expiry = expiresAt[node];
        if (expiry == 0) return false;
        return block.timestamp > expiry && block.timestamp <= expiry + GRACE_PERIOD;
    }

    function isAvailableBasic(string calldata name) external view returns (bool) {
        bytes32 node = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, keccak256(bytes(name)))
        );
        return _isAvailable(node);
    }

    function isAvailableProject(
        string calldata name,
        string calldata project
    ) external view returns (bool) {
        bytes32 projectNode = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, keccak256(bytes(project)))
        );
        bytes32 node = keccak256(
            abi.encodePacked(projectNode, keccak256(bytes(name)))
        );
        return _isAvailable(node);
    }

    function isNamespaceAvailable(string calldata project) external view returns (bool) {
        bytes32 labelHash = keccak256(bytes(project));
        bytes32 projectNode = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, labelHash)
        );
        return _isAvailable(projectNode);
    }

    function getOwner(bytes32 node) external view returns (address) {
        if (_isAvailable(node)) return address(0);
        return _ownerOf(uint256(node));
    }

    function getExpiry(bytes32 node) external view returns (
        uint256 expiry, bool isLifetime, bool inGrace
    ) {
        expiry     = expiresAt[node];
        isLifetime = (expiry == 0) && (_ownerOf(uint256(node)) != address(0));
        inGrace    = _inGracePeriod(node);
    }

    function isActive(bytes32 node) public view returns (bool) {
        if (_ownerOf(uint256(node)) == address(0)) return false;
        uint256 expiry = expiresAt[node];
        if (expiry == 0) return true;
        return block.timestamp <= expiry;
    }

    function resolveIfActive(bytes32 node, address resolverAddr) external view returns (address) {
        if (!isActive(node)) return address(0);
        (bool ok, bytes memory data) = resolverAddr.staticcall(
            abi.encodeWithSignature("addr(bytes32)", node)
        );
        if (!ok || data.length == 0) return address(0);
        return abi.decode(data, (address));
    }

    // ─────────────────────────────────────────────
    //  Project namespace creation
    // ─────────────────────────────────────────────

    function createProject(string calldata project) external onlyOwner {
        _createProject(project, msg.sender, true);
    }

    function buyProject(string calldata project, bool lifetime) external payable {
        uint256 price = lifetime ? getNamespaceLifetimePrice() : getNamespaceYearPrice();
        require(msg.value >= price, "ETNRegistrar: insufficient fee");

        _createProject(project, msg.sender, lifetime);
        _handlePayment(price);

        if (msg.value > price) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(ok, "ETNRegistrar: refund failed");
        }
    }

    /**
     * @dev FIXED: removed the explicit registry.setOwner(projectNode, creator)
     *      call that previously fired BEFORE _safeMint. That call handed
     *      registry authority to `creator` early, so when _safeMint triggered
     *      the _update hook (which also calls registry.setOwner internally),
     *      the registrar no longer had authority and the hook's call reverted.
     *      Now: setSubnodeOwner (registrar keeps authority) → mint (hook
     *      syncs registry while authority is still held) → done.
     */
    function _createProject(
        string calldata project,
        address creator,
        bool lifetime
    ) internal {
        bytes memory label = bytes(project);
        require(label.length >= 1, "ETNRegistrar: empty project");
        _validateLabel(project);
        bytes32 labelHash = keccak256(label);

        bytes32 projectNode = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, labelHash)
        );

        require(_isAvailable(projectNode), "ETNRegistrar: project exists");

        // Registrar takes temporary ownership of the new subnode
        registry.setSubnodeOwner(ETNNamehash.ETN_NODE, labelHash, address(this));

        // Mint the namespace NFT — _update hook syncs registry ownership to
        // `creator` automatically, while the registrar still holds authority.
        uint256 tokenId = uint256(projectNode);

    // AUTO-APPROVE: Let registrar manage registry sync on transfers
    registry.setApprovalForAll(projectNode, address(this), true);

    _safeMint(creator, tokenId);

    projectExists[labelHash]  = true;
    projectCreator[labelHash] = creator;
    nodeType[projectNode]     = TYPE_NAMESPACE;
    fullName[projectNode]     = string(abi.encodePacked(project, ".etn"));

    uint256 expiry = lifetime ? 0 : block.timestamp + LEASE_DURATION;
    expiresAt[projectNode]        = expiry;
    projectExpiresAt[projectNode] = expiry;
    
    emit ProjectCreated(project, projectNode, creator, lifetime, expiry);
}

    function renewProject(string calldata project) external payable {
        bytes32 labelHash = keccak256(bytes(project));
        bytes32 projectNode = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, labelHash)
        );

        require(_ownerOf(uint256(projectNode)) == msg.sender, "ETNRegistrar: not owner");
        uint256 currentExpiry = expiresAt[projectNode];
        require(currentExpiry != 0, "ETNRegistrar: lifetime, no renewal needed");
        require(
            block.timestamp <= currentExpiry + GRACE_PERIOD,
            "ETNRegistrar: grace period expired"
        );

        uint256 price = getNamespaceYearPrice();
        require(msg.value >= price, "ETNRegistrar: insufficient fee");

        uint256 newExpiry = currentExpiry + LEASE_DURATION;
        expiresAt[projectNode]        = newExpiry;
        projectExpiresAt[projectNode] = newExpiry;

        _handlePayment(price);

        if (msg.value > price) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(ok, "ETNRegistrar: refund failed");
        }

        emit ProjectRenewed(projectNode, newExpiry);
    }

    function getProjectCreator(string calldata project) external view returns (address) {
        return projectCreator[keccak256(bytes(project))];
    }

    // ─────────────────────────────────────────────
    //  Registration — Basic (name.etn)
    // ─────────────────────────────────────────────

    function registerBasic(
        string calldata name,
        address resolver,
        bool lifetime
    ) external payable {
        uint256 price = lifetime ? getBasicLifetimePrice() : getBasicYearPrice();
        require(msg.value >= price, "ETNRegistrar: insufficient fee");
        _validateLabel(name);

        bytes32 labelHash = keccak256(bytes(name));
        bytes32 node = keccak256(abi.encodePacked(ETNNamehash.ETN_NODE, labelHash));

        require(_isAvailable(node), "ETNRegistrar: name taken");

        string memory fname = string(abi.encodePacked(name, ".etn"));
        _register(RegisterParams({
            node:       node,
            parentNode: ETNNamehash.ETN_NODE,
            labelHash:  labelHash,
            resolver:   resolver,
            lifetime:   lifetime,
            nodeType:   TYPE_BASIC,
            fullName:   fname,
            project:    ""
        }));
        _handlePayment(price);

        if (msg.value > price) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(ok, "ETNRegistrar: refund failed");
        }

        uint256 expiry = lifetime ? 0 : block.timestamp + LEASE_DURATION;
        emit NameRegistered(node, name, "etn", msg.sender, lifetime, expiry);
    }

    // ─────────────────────────────────────────────
    //  Registration — Project (name.project.etn)
    // ─────────────────────────────────────────────

function registerProject(
    string calldata name,
    string calldata project,
    address resolver,
    bool lifetime
) external payable {
    bytes32 projectLabelHash = keccak256(bytes(project));
    require(projectExists[projectLabelHash], "ETNRegistrar: project not found");

    bytes32 projectNode = keccak256(abi.encodePacked(ETNNamehash.ETN_NODE, projectLabelHash));
    require(!_isAvailable(projectNode), "ETNRegistrar: namespace expired");

    uint256 price;
    if (lifetime) {
        uint256 customPrice = namespaceProjectLifetimePrice[projectNode];
        price = customPrice > 0 ? customPrice : fallbackProjectLifetimePrice;
    } else {
        uint256 customPrice = namespaceProjectYearPrice[projectNode];
        price = customPrice > 0 ? customPrice : fallbackProjectYearPrice;
    }

    require(msg.value >= price, "ETNRegistrar: insufficient fee");
    _validateLabel(name);

    bytes32 nameLabelHash = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(projectNode, nameLabelHash));
    require(_isAvailable(node), "ETNRegistrar: name taken");

    string memory fname = string(abi.encodePacked(name, ".", project, ".etn"));
    _register(RegisterParams({
        node: node, parentNode: projectNode, labelHash: nameLabelHash,
        resolver: resolver, lifetime: lifetime, nodeType: TYPE_PROJECT_NAME,
        fullName: fname, project: project
    }));

    _handleProjectNamePayment(price, projectCreator[projectLabelHash]);

    if (msg.value > price) {
        (bool ok, ) = payable(msg.sender).call{value: msg.value - price}("");
        require(ok, "ETNRegistrar: refund failed");
    }

    uint256 expiry = lifetime ? 0 : block.timestamp + LEASE_DURATION;
    emit NameRegistered(node, fname, "etn", msg.sender, lifetime, expiry);
}

function _handleProjectNamePayment(uint256 total, address namespaceOwner) internal {
    uint256 ownerCut = (total * projectNameOwnerSharePercent) / 100;
    uint256 burnPortion = (total * projectNameBurnSharePercent) / 100;
    uint256 feePortion = total - ownerCut - burnPortion; // remainder, avoids rounding dust

    ownerAccruedFees[namespaceOwner] += ownerCut;
    accruedFees += feePortion;

    if (coreToken != address(0) && burnPortion > 0) {
        _buyAndBurnCore(burnPortion);
    } else {
        accruedFees += burnPortion;
    }
}

    struct RegisterParams {
        bytes32 node;
        bytes32 parentNode;
        bytes32 labelHash;
        address resolver;
        bool    lifetime;
        uint8   nodeType;
        string  fullName;
        string  project;
    }

    /**
     * @dev FIXED: removed the explicit registry.setOwner(p.node, msg.sender)
     *      call that previously fired BEFORE _safeMint/_update for the same
     *      reason as _createProject above. Now the registrar keeps registry
     *      authority through setSubnodeOwner + setResolver, then mints —
     *      the _update hook syncs registry ownership to msg.sender while
     *      authority is still held.
     */
    function _register(RegisterParams memory p) internal {
        address resolverAddr = p.resolver == address(0) ? defaultResolver : p.resolver;

        // Registrar takes temporary ownership of the new subnode
        registry.setSubnodeOwner(p.parentNode, p.labelHash, address(this));

        // Registrar still holds authority here — safe to configure resolver
        if (resolverAddr != address(0)) {
            registry.setResolver(p.node, resolverAddr);
            try IETNResolver(resolverAddr).setAddr(p.node, msg.sender) {} catch {}
        }

        // Burn any stale token first if reclaiming an expired name
        uint256 tokenId = uint256(p.node);
        if (_ownerOf(tokenId) != address(0)) {
            _update(address(0), tokenId, address(0));
        }

    // AUTO-APPROVE: Let registrar manage registry sync on transfers
    registry.setApprovalForAll(p.node, address(this), true);

    // Mint — _update hook syncs registry ownership to msg.sender
    // automatically, while the registrar still holds authority.
    _safeMint(msg.sender, tokenId);

    nodeType[p.node]      = p.nodeType;
    fullName[p.node]      = p.fullName;
    parentProject[p.node] = p.project;
    expiresAt[p.node]     = p.lifetime ? 0 : block.timestamp + LEASE_DURATION;
    }

function renew(bytes32 node) external payable {
    require(_ownerOf(uint256(node)) == msg.sender, "ETNRegistrar: not owner");

    uint256 currentExpiry = expiresAt[node];
    require(currentExpiry != 0, "ETNRegistrar: lifetime, no renewal needed");
    require(
        block.timestamp <= currentExpiry + GRACE_PERIOD,
        "ETNRegistrar: grace period expired"
    );

    uint8 t = nodeType[node];
    uint256 price;
    address namespaceOwner = address(0);

    if (t == TYPE_PROJECT_NAME) {
        bytes32 projectLabelHash = keccak256(bytes(parentProject[node]));
        bytes32 projectNode = keccak256(abi.encodePacked(ETNNamehash.ETN_NODE, projectLabelHash));

        uint256 customPrice = namespaceProjectYearPrice[projectNode];
        price = customPrice > 0 ? customPrice : fallbackProjectYearPrice;
        namespaceOwner = projectCreator[projectLabelHash];
    } else {
        price = getBasicYearPrice();
    }

    require(msg.value >= price, "ETNRegistrar: insufficient fee");

    uint256 newExpiry = currentExpiry + LEASE_DURATION;
    expiresAt[node] = newExpiry;

    if (t == TYPE_PROJECT_NAME) {
        _handleProjectNamePayment(price, namespaceOwner);
    } else {
        _handlePayment(price);
    }

    if (msg.value > price) {
        (bool ok, ) = payable(msg.sender).call{value: msg.value - price}("");
        require(ok, "ETNRegistrar: refund failed");
    }

    emit NameRenewed(node, newExpiry);
}

    // ─────────────────────────────────────────────
    //  ERC-721 hook — keep ETNRegistry in sync automatically
    // ─────────────────────────────────────────────

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = super._update(to, tokenId, auth);

        bytes32 node = bytes32(tokenId);
        if (to != address(0)) {
            registry.setOwner(node, to);
        }

        return from;
    }

    function transferFrom(address from, address to, uint256 tokenId) public virtual override {
        require(!_inGracePeriod(bytes32(tokenId)), "ETNRegistrar: cannot transfer during grace period");
        super.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public virtual override {
        require(!_inGracePeriod(bytes32(tokenId)), "ETNRegistrar: cannot transfer during grace period");
        super.safeTransferFrom(from, to, tokenId, data);
    }

    // ─────────────────────────────────────────────
    //  Dynamic on-chain metadata
    // ─────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        bytes32 node = bytes32(tokenId);

        string memory json = _buildMetadataJson(node);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _buildMetadataJson(bytes32 node) internal view returns (string memory) {
        string memory nm = fullName[node];
        uint8 t = nodeType[node];
        uint256 expiry = expiresAt[node];
        bool lifetime = (expiry == 0);

        string memory typeLabel = t == TYPE_NAMESPACE
            ? "Namespace"
            : (t == TYPE_PROJECT_NAME ? "Project Name" : "Basic");

        string memory img = bytes(nodeImageURI[node]).length > 0
            ? nodeImageURI[node]
            : placeholderImageURI;

        string memory imagePart = bytes(img).length > 0
            ? string(abi.encodePacked('"image":"', img, '",'))
            : "";

        string memory projectAttr = "";
        if (t == TYPE_PROJECT_NAME) {
            projectAttr = string(abi.encodePacked(
                ',{"trait_type":"Project","value":"', parentProject[node], '"}'
            ));
        }

        string memory expiryAttr = lifetime
            ? '{"trait_type":"Lifetime","value":"true"}'
            : string(abi.encodePacked(
                '{"trait_type":"Lifetime","value":"false"},',
                '{"trait_type":"Expires","value":"', expiry.toString(), '"}'
            ));

        return string(abi.encodePacked(
            '{"name":"', nm, '",',
            '"description":"An Electroneum Name Service identity.",',
            imagePart,
            '"attributes":[',
                '{"trait_type":"Type","value":"', typeLabel, '"},',
                expiryAttr,
                projectAttr,
            ']}'
        ));
    }

    // ─────────────────────────────────────────────
    //  Internal — USD to ETN conversion
    // ─────────────────────────────────────────────

    function _usdToEtn(
        uint256 usdAmount,
        uint256 fallbackPrice
    ) internal view returns (uint256) {
        (uint256 etnUsdPrice, bool valid) = getOraclePrice();
        if (!valid) return fallbackPrice;
        return (usdAmount * 1e20) / (etnUsdPrice * 1e6);
    }

    // ─────────────────────────────────────────────
    //  Internal — payment split & burn
    // ─────────────────────────────────────────────

    function _handlePayment(uint256 total) internal {
        uint256 burnPortion = (total * 50) / 100;
        uint256 feePortion  = total - burnPortion;

        accruedFees += feePortion;

        if (coreToken != address(0) && burnPortion > 0) {
            _buyAndBurnCore(burnPortion);
        } else {
            accruedFees += burnPortion;
        }
    }

    function _buyAndBurnCore(uint256 etnAmount) internal {
        address[] memory path = new address[](2);
        path[0] = WETN;
        path[1] = coreToken;

        uint256 balBefore = IERC20Burnable(coreToken).balanceOf(address(this));

        try router.swapExactETHForTokens{value: etnAmount}(
            0,
            path,
            address(this),
            block.timestamp + 5 minutes
        ) {} catch {
            accruedFees += etnAmount;
            return;
        }

        uint256 received = IERC20Burnable(coreToken).balanceOf(address(this)) - balBefore;
        if (received > 0) {
            IERC20Burnable(coreToken).burn(received);
            emit CoreBurned(etnAmount, received);
        }
    }

    // ─────────────────────────────────────────────
    //  Internal — label validation
    // ─────────────────────────────────────────────

    function _validateLabel(string calldata label) internal pure {
        bytes memory b = bytes(label);
        require(b.length >= 1 && b.length <= 63, "ETNRegistrar: invalid length");
        require(b[0] != 0x2D && b[b.length - 1] != 0x2D, "ETNRegistrar: leading/trailing hyphen");
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            require(
                (c >= 0x61 && c <= 0x7A) ||
                (c >= 0x30 && c <= 0x39) ||
                 c == 0x2D,
                "ETNRegistrar: invalid char (use a-z 0-9 -)"
            );
        }
    }

    // ─────────────────────────────────────────────
    //  Receive ETN
    // ─────────────────────────────────────────────

    receive() external payable {}
}