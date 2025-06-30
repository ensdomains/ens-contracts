// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractReverseResolver} from "./AbstractReverseResolver.sol";
import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";
import {GatewayFetchTarget, IGatewayVerifier} from "@unruggable/gateways/contracts/GatewayFetchTarget.sol";
import {GatewayFetcher, GatewayRequest} from "@unruggable/gateways/contracts/GatewayFetcher.sol";
import {IStandaloneReverseRegistrar} from "../reverseRegistrar/IStandaloneReverseRegistrar.sol";
import {INameReverser} from "./INameReverser.sol";

/// @title Chain Reverse Resolver
/// @notice Reverses an EVM address using the first non-null response from the following sources:
///         1. `L2ReverseRegistrar` on L2 chain via Unruggable Gateway
///         2. `IStandaloneReverseRegistrar` for "default.reverse"
contract ChainReverseResolver is
    AbstractReverseResolver,
    GatewayFetchTarget,
    Ownable
{
    using GatewayFetcher for GatewayRequest;

    /// @notice The reverse registrar contract for "default.reverse".
    IStandaloneReverseRegistrar public immutable defaultRegistrar;

    /// @notice The reverse registrar address on the L2 chain.
    address public immutable l2Registrar;

    /// @notice Storage slot for the names mapping in `L2ReverseRegistrar`.
    uint256 constant NAMES_SLOT = 0;

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
        address _l2Registrar,
        IGatewayVerifier verifier,
        string[] memory gateways
    ) Ownable(_owner) AbstractReverseResolver(coinType, _l2Registrar) {
        defaultRegistrar = _defaultRegistrar;
        l2Registrar = _l2Registrar;
        gatewayVerifier = verifier;
        gatewayURLs = gateways;
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
        req.setTarget(l2Registrar); // target L2 registrar
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
    function resolveNames(
        address[] memory addrs,
        uint8 perPage
    ) external view returns (string[] memory names) {
        names = new string[](addrs.length);
        _resolveNames(addrs, names, 0, perPage);
    }

    /// @dev Resolve the next page of addresses to names.
    ///      This function executes over multiple steps.
    function _resolveNames(
        address[] memory addrs,
        string[] memory names,
        uint256 start,
        uint8 perPage
    ) internal view {
        uint256 end = start + perPage;
        if (end > addrs.length) end = addrs.length;
        uint8 count = uint8(end - start);
        if (count == 0) return; // done
        GatewayRequest memory req = GatewayFetcher.newRequest(count);
        req.setTarget(l2Registrar); // target L2 registrar
        for (uint256 i; i < count; i++) {
            req.setSlot(NAMES_SLOT).push(addrs[start + i]).follow().readBytes(); // names[addr[i]]
            req.setOutput(uint8(i));
        }
        fetch(
            gatewayVerifier,
            req,
            this.resolveNamesCallback.selector, // ==> step 2
            abi.encode(addrs, names, start, perPage),
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
        address[] memory addrs;
        uint256 start;
        uint8 perPage;
        (addrs, names, start, perPage) = abi.decode(
            extraData,
            (address[], string[], uint256, uint8)
        );
        for (uint256 i; i < values.length; i++) {
            string memory name = string(values[i]);
            if (bytes(name).length == 0) {
                name = defaultRegistrar.nameForAddr(addrs[i]);
            }
            names[start + i] = name;
        }
        _resolveNames(addrs, names, start + values.length, perPage); // ==> goto step 1 again
    }
}
