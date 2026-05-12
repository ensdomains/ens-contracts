// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC165} from "@openzeppelin/contracts-v5/utils/introspection/ERC165.sol";
import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";

import {GatewayFetchTarget, IGatewayVerifier} from "@unruggable/gateways/GatewayFetchTarget.sol";
import {GatewayFetcher, GatewayRequest, RequestOverflow} from "@unruggable/gateways/GatewayFetcher.sol";

import {AbstractReverseResolver} from "./AbstractReverseResolver.sol";
import {IStandaloneReverseRegistrar} from "../reverseRegistrar/IStandaloneReverseRegistrar.sol";
import {IVerifiableResolver} from "../resolvers/profiles/IVerifiableResolver.sol";
import {INameReverser} from "./INameReverser.sol";
import {ENSIP19} from "../utils/ENSIP19.sol";

/// @title Chain Reverse Resolver
/// @notice Reverses an EVM address using the first non-null response from the following sources:
///
/// 1. `L2ReverseRegistrar` on L2 chain via Unruggable Gateway
/// 2. `IStandaloneReverseRegistrar` for "default.reverse"
///
contract ChainReverseResolver is
    AbstractReverseResolver,
	IVerifiableResolver,
    GatewayFetchTarget,
    Ownable
{
    using GatewayFetcher for GatewayRequest;

    /// @notice Storage slot for the names mapping in `L2ReverseRegistrar`.
    uint256 constant NAMES_SLOT = 0;

    /// @notice The reverse registrar contract for "default.reverse".
    IStandaloneReverseRegistrar public immutable defaultRegistrar;

    /// @notice The verifier contract for the L2 chain.
    IGatewayVerifier public gatewayVerifier;

    /// @notice Gateway URLs for the verifier contract.
    string[] public gatewayURLs;

    /// @notice Emitted when the gateway verifier is changed.
    event GatewayVerifierChanged(address verifier);

    /// @notice Emitted when the gateway URLs are changed.
    event GatewayURLsChanged(string[] urls);

    constructor(
        address _owner,
        uint256 coinType,
        IStandaloneReverseRegistrar _defaultRegistrar,
        address _chainRegistrar,
        IGatewayVerifier verifier,
        string[] memory gateways
    ) Ownable(_owner) AbstractReverseResolver(coinType, _chainRegistrar) {
        defaultRegistrar = _defaultRegistrar;
        gatewayVerifier = verifier;
        gatewayURLs = gateways;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IVerifiableResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

	/// @inheritdoc IVerifiableResolver
    function verifierMetadata(
        bytes memory name
    ) external view returns (address verifier, string[] memory gateways) {
		 (bytes memory a, uint256 ct) = ENSIP19.parse(name);
		 if (a.length == 20 && ct == coinType) {
			return (address(gatewayVerifier), gatewayURLs);
		 }
	}

    /// @notice Set gateway URLs.
    /// @param gateways The new gateway URLs.
    function setGatewayURLs(string[] memory gateways) external onlyOwner {
        gatewayURLs = gateways;
        emit GatewayURLsChanged(gateways);
    }

    /// @notice Set the verifier contract.
    /// @param verifier The new verifier contract.
    function setGatewayVerifier(address verifier) external onlyOwner {
        gatewayVerifier = IGatewayVerifier(verifier);
        emit GatewayVerifierChanged(verifier);
    }

    /// @inheritdoc AbstractReverseResolver
    function _resolveName(
        address addr
    ) internal view override returns (string memory) {
        GatewayRequest memory req = GatewayFetcher.newRequest(1);
        req.setTarget(chainRegistrar);
        req.setSlot(NAMES_SLOT).push(addr).follow().readBytes(); // names[addr]
        req.setOutput(0);
        fetch(
            gatewayVerifier,
            req,
            this.resolveNameCallback.selector, // ==> step 2
            abi.encode(addr),
            gatewayURLs
        );
    }

    /// @dev CCIP-Read callback for `_resolveName()`.
    /// @param values The outputs for `GatewayRequest` (1 name).
    /// @param extraData The contextual data passed from `_resolveName()`.
    /// @return result The abi-encoded name for the given address.
    function resolveNameCallback(
        bytes[] memory values,
        uint8 /* exitCode */,
        bytes calldata extraData
    ) external view returns (bytes memory result) {
        string memory name = string(values[0]);
        if (bytes(name).length == 0) {
            address addr = abi.decode(extraData, (address));
            name = defaultRegistrar.nameForAddr(addr);
        }
        result = abi.encode(name);
    }

    /// @inheritdoc INameReverser
    /// @dev Reverts with a variety of errors.
    /// - reverts `RequestOverflow` if too many addresses.
    /// - Gateway request may fail if too many proofs.
    /// - Gateway response may run out of gas.
    function resolveNames(
        address[] memory addrs
    ) external view returns (string[] memory) {
        if (addrs.length > 255) {
            revert RequestOverflow();
        }
        GatewayRequest memory req = GatewayFetcher.newRequest(
            uint8(addrs.length)
        );
        req.setTarget(chainRegistrar); // target L2 registrar
        for (uint256 i; i < addrs.length; ++i) {
            req.setSlot(NAMES_SLOT).push(addrs[i]).follow().readBytes(); // names[addr[i]]
            req.setOutput(uint8(i));
        }
        fetch(
            gatewayVerifier,
            req,
            this.resolveNamesCallback.selector, // ==> step 2
            abi.encode(addrs),
            gatewayURLs
        );
    }

    /// @dev CCIP-Read callback for `_resolveNames()`.
    ///      Recursive if there are still addresses to resolve.
    /// @param values The outputs for `GatewayRequest` (N names).
    /// @param extraData The contextual data passed from `_resolveNames()`.
    /// @return names The resolved names.
    function resolveNamesCallback(
        bytes[] memory values,
        uint8 /* exitCode */,
        bytes calldata extraData
    ) external view returns (string[] memory names) {
        address[] memory addrs = abi.decode(extraData, (address[]));
        names = new string[](addrs.length);
        for (uint256 i; i < addrs.length; ++i) {
            string memory name = string(values[i]);
            if (bytes(name).length == 0) {
                name = defaultRegistrar.nameForAddr(addrs[i]);
            }
            names[i] = name;
        }
    }
}
