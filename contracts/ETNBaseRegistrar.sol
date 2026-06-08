// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://raw.githubusercontent.com/ETN-Villain/ETNnames/staging/contracts/ETNNamehash.sol";
import "https://raw.githubusercontent.com/ETN-Villain/ETNnames/staging/contracts/ETNRegistry.sol";
// ─── Minimal interfaces ───────────────────────────────────────────────────────

interface IETNResolver {
    function setAddr(bytes32 node, address addr) external;
}

/// @dev Uniswap V2–style router (ElectroSwap uses the same ABI)
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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title ETNBaseRegistrar
 * @notice Registers .etn (basic) and .project.etn (project) names.
 *
 *  Pricing (in wei, denominated in native ETN):
 *    Basic   name.etn          → BASIC_PRICE   (10,000 ETN)
 *    Project name.project.etn  → PROJECT_PRICE (25,000 ETN)
 *
 *  Token-burn mechanic:
 *    50% of every registration fee is swapped on ElectroSwap for CORE token
 *    and immediately sent to address(0) via burn().
 *    The remaining 50% is held for the contract owner to withdraw.
 *
 *  Architecture notes:
 *    • Names are perpetual (no expiry) in v1 — renewal can be added in v2.
 *    • Project namespaces must be created by the owner before users can
 *      register sub-names under them.
 *    • A default public resolver is set on each registration so wallets
 *      can immediately resolve addresses.
 */
contract ETNBaseRegistrar {

    using ETNNamehash for bytes32;

    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────

    uint256 public constant ETN_DECIMALS  = 1e18;
    uint256 public constant BASIC_PRICE   = 10_000 * ETN_DECIMALS;
    uint256 public constant PROJECT_PRICE = 25_000 * ETN_DECIMALS;
    uint256 public constant BURN_PERCENT  = 50;

    address public constant DEAD = address(0x000000000000000000000000000000000000dEaD);

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

    /// node → registrant address
    mapping(bytes32 => address) public nameOwner;

    /// project label hash → exists
    mapping(bytes32 => bool) public projectExists;

    /// Accumulated protocol fees (50%) available for withdrawal
    uint256 public accruedFees;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    event NameRegistered(
        bytes32 indexed node,
        string  name,
        string  tld,
        address indexed registrant
    );
    event ProjectCreated(string project, bytes32 indexed projectNode);
    event CoreBurned(uint256 etnIn, uint256 coreBurned);
    event ResolverUpdated(address resolver);
    event CoreTokenUpdated(address token);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event FeesWithdrawn(address to, uint256 amount);

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

    /**
     * @param _registry        Deployed ETNRegistry address
     * @param _router          ElectroSwap V2 router (0x072D4706f9A383D5608BD14B09b41683cb95fFd7)
     * @param _coreToken       CORE ERC-20 token address (update once known)
     * @param _defaultResolver Public resolver address
     */
    constructor(
        address _registry,
        address _router,
        address _coreToken,
        address _defaultResolver
    ) {
        registry        = ETNRegistry(_registry);
        router          = IUniswapV2Router(_router);
        WETN            = IUniswapV2Router(_router).WETH();
        coreToken       = _coreToken;
        defaultResolver = _defaultResolver;
        owner           = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────

    function setCoreToken(address _token) external onlyOwner {
        coreToken = _token;
        emit CoreTokenUpdated(_token);
    }

    function setDefaultResolver(address _resolver) external onlyOwner {
        defaultResolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    /**
     * @notice Create a project namespace so users can register name.project.etn
     * @param project  Plain-text project label (e.g. "defi", "gaming")
     */
    function createProject(string calldata project) external onlyOwner {
        bytes memory label = bytes(project);
        require(label.length >= 1, "ETNRegistrar: empty project");
        bytes32 labelHash = keccak256(label);
        require(!projectExists[labelHash], "ETNRegistrar: project exists");

        bytes32 projectNode = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, labelHash)
        );

        registry.setSubnodeOwner(ETNNamehash.ETN_NODE, labelHash, address(this));

        projectExists[labelHash] = true;
        emit ProjectCreated(project, projectNode);
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

    // ─────────────────────────────────────────────
    //  Registration — Basic  (name.etn)
    // ─────────────────────────────────────────────

    /**
     * @notice Register a basic name.etn for 10,000 ETN
     * @param name     Desired label (e.g. "alice")
     * @param resolver Resolver to set; pass address(0) to use default
     */
    function registerBasic(
        string calldata name,
        address resolver
    ) external payable {
        require(msg.value == BASIC_PRICE, "ETNRegistrar: wrong fee (need 10000 ETN)");
        _validateLabel(name);

        bytes32 labelHash = keccak256(bytes(name));
        bytes32 node      = keccak256(abi.encodePacked(ETNNamehash.ETN_NODE, labelHash));

        require(nameOwner[node] == address(0), "ETNRegistrar: name taken");

        address resolverAddr = resolver == address(0) ? defaultResolver : resolver;
        registry.setSubnodeOwner(ETNNamehash.ETN_NODE, labelHash, msg.sender);
        if (resolverAddr != address(0)) {
            registry.setResolver(node, resolverAddr);
            try IETNResolver(resolverAddr).setAddr(node, msg.sender) {} catch {}
        }

        nameOwner[node] = msg.sender;
        _handlePayment(BASIC_PRICE);

        emit NameRegistered(node, name, "etn", msg.sender);
    }

    // ─────────────────────────────────────────────
    //  Registration — Project  (name.project.etn)
    // ─────────────────────────────────────────────

    /**
     * @notice Register a name.project.etn for 25,000 ETN
     * @param name     Sub-name label (e.g. "alice")
     * @param project  Project label  (e.g. "gaming") — must exist
     * @param resolver Resolver to set; pass address(0) for default
     */
    function registerProject(
        string calldata name,
        string calldata project,
        address resolver
    ) external payable {
        require(msg.value == PROJECT_PRICE, "ETNRegistrar: wrong fee (need 25000 ETN)");
        _validateLabel(name);

        bytes32 projectLabelHash = keccak256(bytes(project));
        require(projectExists[projectLabelHash], "ETNRegistrar: project not found");

        bytes32 projectNode = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, projectLabelHash)
        );
        bytes32 nameLabelHash = keccak256(bytes(name));
        bytes32 node = keccak256(abi.encodePacked(projectNode, nameLabelHash));

        require(nameOwner[node] == address(0), "ETNRegistrar: name taken");

        address resolverAddr = resolver == address(0) ? defaultResolver : resolver;
        registry.setSubnodeOwner(projectNode, nameLabelHash, msg.sender);
        if (resolverAddr != address(0)) {
            registry.setResolver(node, resolverAddr);
            try IETNResolver(resolverAddr).setAddr(node, msg.sender) {} catch {}
        }

        nameOwner[node] = msg.sender;
        _handlePayment(PROJECT_PRICE);

        string memory fullName = string(abi.encodePacked(name, ".", project));
        emit NameRegistered(node, fullName, "etn", msg.sender);
    }

    // ─────────────────────────────────────────────
    //  Name transfer
    // ─────────────────────────────────────────────

    function transfer(bytes32 node, address to) external {
        require(nameOwner[node] == msg.sender, "ETNRegistrar: not name owner");
        require(to != address(0), "ETNRegistrar: zero address");
        nameOwner[node] = to;
        registry.setOwner(node, to);
    }

    // ─────────────────────────────────────────────
    //  Lookup helpers
    // ─────────────────────────────────────────────

    function isAvailableBasic(string calldata name) external view returns (bool) {
        bytes32 node = keccak256(
            abi.encodePacked(ETNNamehash.ETN_NODE, keccak256(bytes(name)))
        );
        return nameOwner[node] == address(0);
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
        return nameOwner[node] == address(0);
    }

    // ─────────────────────────────────────────────
    //  Internal — payment split & burn
    // ─────────────────────────────────────────────

    function _handlePayment(uint256 total) internal {
        uint256 burnPortion = (total * BURN_PERCENT) / 100;
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
                (c >= 0x61 && c <= 0x7A) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                 c == 0x2D,                  // hyphen
                "ETNRegistrar: invalid char (use a-z 0-9 -)"
            );
        }
    }

    // ─────────────────────────────────────────────
    //  Receive ETN
    // ─────────────────────────────────────────────

    receive() external payable {}
}