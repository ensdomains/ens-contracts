//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {PublicResolver, INameWrapper} from "../resolvers/PublicResolver.sol";
import {ENS} from "../registry/ENS.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title SimplexResolver
/// @notice PublicResolver plus a sponsored path: the name's owner signs a
///         record change and a relayer submits it, so a user never needs ETH.
///
/// The sponsored path is metered per name by edit credits, granted by the
/// controller at registration and renewal. A direct `setText` by the owner is
/// never metered. Credits are added, never set: `renew` is unauthenticated, so
/// set semantics would let a stranger collapse an owner's allowance.
contract SimplexResolver is PublicResolver {
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 private constant _EIP712_NAME = keccak256("SimplexResolver");
    bytes32 private constant _EIP712_VERSION = keccak256("1");
    bytes32 public constant SET_TEXT_TYPEHASH =
        keccak256(
            "SetText(bytes32 node,string key,string value,uint256 nonce,uint256 deadline)"
        );

    /// @dev The controller may grant credits. Set once at deployment.
    address public immutable trustedController;

    /// @dev Relayed writes remaining, per name.
    mapping(bytes32 => uint256) public editCredits;

    /// @dev One counter per signer. Shared across every node they own, so
    ///      intents from one owner are consumed strictly in order.
    mapping(address => uint256) public nonces;

    event EditCreditsGranted(bytes32 indexed node, uint256 added, uint256 total);

    error NotController();
    error SignatureExpired();
    error InvalidNonce();
    error InvalidSignature();
    error NoEditCredits();

    constructor(
        ENS _ens,
        INameWrapper wrapperAddress,
        address _trustedETHController,
        address _trustedReverseRegistrar,
        address _trustedController
    )
        PublicResolver(
            _ens,
            wrapperAddress,
            _trustedETHController,
            _trustedReverseRegistrar
        )
    {
        trustedController = _trustedController;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _EIP712_DOMAIN_TYPEHASH,
                    _EIP712_NAME,
                    _EIP712_VERSION,
                    block.chainid,
                    address(this)
                )
            );
    }

    /// @notice Add to a name's relayed-write allowance.
    function grantEditCredits(bytes32 node, uint256 amount) external {
        if (msg.sender != trustedController) revert NotController();
        uint256 total = editCredits[node] + amount;
        editCredits[node] = total;
        emit EditCreditsGranted(node, amount, total);
    }

    /// @notice Write a text record on behalf of the name's owner. Authority
    ///         comes from the signature, not the caller.
    function setTextWithSig(
        bytes32 node,
        string calldata key,
        string calldata value,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external {
        _authorizeRelayed(node, key, value, nonce, deadline, sig);
        versionable_texts[recordVersions[node]][node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    function _authorizeRelayed(
        bytes32 node,
        string calldata key,
        string calldata value,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) internal {
        if (block.timestamp > deadline) revert SignatureExpired();
        address owner = ens.owner(node);
        if (nonce != nonces[owner]) revert InvalidNonce();
        if (
            !SignatureChecker.isValidSignatureNow(
                owner,
                _setTextDigest(node, key, value, nonce, deadline),
                sig
            )
        ) revert InvalidSignature();
        uint256 credits = editCredits[node];
        if (credits == 0) revert NoEditCredits();
        unchecked {
            editCredits[node] = credits - 1;
            nonces[owner] = nonce + 1;
        }
    }

    function _setTextDigest(
        bytes32 node,
        string calldata key,
        string calldata value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR(),
                    keccak256(
                        abi.encode(
                            SET_TEXT_TYPEHASH,
                            node,
                            keccak256(bytes(key)),
                            keccak256(bytes(value)),
                            nonce,
                            deadline
                        )
                    )
                )
            );
    }
}
