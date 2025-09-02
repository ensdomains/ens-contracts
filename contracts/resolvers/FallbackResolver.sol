// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

import {ERC165} from "@openzeppelin/contracts-v5/utils/introspection/ERC165.sol";
import {Clones} from "@openzeppelin/contracts-v5/proxy/Clones.sol";

import {CCIPReader} from "../ccipRead/CCIPReader.sol";
import {ResolverCaller} from "../universalResolver/ResolverCaller.sol";
import {IGatewayProvider} from "../ccipRead/IGatewayProvider.sol";
import {BytesUtils} from "../utils/BytesUtils.sol";
import {IERC7996} from "../utils/IERC7996.sol";
import {ResolverFeatures} from "./ResolverFeatures.sol";

// resolver profiles
import {IExtendedResolver} from "./profiles/IExtendedResolver.sol";
import {IMulticallable} from "./IMulticallable.sol";

contract FallbackResolver is
    ERC165,
    IERC7996,
    ResolverCaller,
    IExtendedResolver
{
    IGatewayProvider public immutable batchGatewayProvider;

    event Deployed(address);

    constructor(
        IGatewayProvider _batchGatewayProvider
    ) CCIPReader(DEFAULT_UNSAFE_CALL_GAS) {
        batchGatewayProvider = _batchGatewayProvider;
    }

    function deploy(
        address[] memory _resolvers
    ) external returns (FallbackResolver) {
        bytes10 prefix;
        address impl;
        assembly {
            extcodecopy(address(), 0, 0, 40)
            prefix := mload(0)
            impl := shr(96, mload(10))
        }
        // check if we're the clone (ERC-1167)
        if (prefix == bytes10(0x363d3d373d3d3d363d73)) {
            return FallbackResolver(impl).deploy(_resolvers);
        }
        address clone = Clones.cloneWithImmutableArgs(
            address(this),
            abi.encode(_resolvers)
        );
        emit Deployed(clone);
        return FallbackResolver(clone);
    }

    function resolvers() public view returns (address[] memory) {
        return abi.decode(Clones.fetchCloneArgs(address(this)), (address[]));
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC165) returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IERC7996
    function supportsFeature(bytes4 featureId) external pure returns (bool) {
        return featureId == ResolverFeatures.RESOLVE_MULTICALL;
    }

    struct State {
        uint256 resolverIndex;
        bytes name;
        bool multi;
        bytes[] calls;
        bytes[] answers;
    }

    /// @inheritdoc IExtendedResolver
    function resolve(
        bytes memory name,
        bytes calldata data
    ) external view returns (bytes memory) {
        State memory state;
        state.name = name;
        if (bytes4(data) == IMulticallable.multicall.selector) {
            state.multi = true;
            state.calls = abi.decode(data[4:], (bytes[]));
        } else {
            state.calls = new bytes[](1);
            state.calls[0] = data;
        }
        state.answers = new bytes[](state.calls.length);
        return _callNext(state);
    }

    function _callNext(
        State memory state
    ) internal view returns (bytes memory) {
        address[] memory v = resolvers();
        if (state.resolverIndex >= v.length) {
            bool answered;
            for (uint256 i; i < state.answers.length; i++) {
                if (state.answers[i].length > 0) {
                    answered = true;
                    break;
                }
            }
            if (answered) {
                if (state.multi) {
                    return abi.encode(state.answers);
                } else {
                    return state.answers[0];
                }
            } else {
                revert UnreachableName(state.name);
            }
        }
        ccipRead(
            address(this),
            abi.encodeCall(
                this.callResolver,
                (
                    v[state.resolverIndex++],
                    state.name,
                    state.multi
                        ? abi.encodeCall(
                            IMulticallable.multicall,
                            (state.calls)
                        )
                        : state.calls[0],
                    batchGatewayProvider.gateways()
                )
            ),
            this.resolveCallback.selector,
            this.resolveCallbackError.selector,
            abi.encode(state)
        );
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        bytes memory unwrapped = abi.decode(response, (bytes));
        State memory state = abi.decode(extraData, (State));
        if (state.multi) {
            bytes[] memory m = abi.decode(unwrapped, (bytes[]));
            bytes[] memory calls = state.calls;
            bytes[] memory answers = state.answers;
            uint256 need;
            uint256 next;
            if (m.length == calls.length) {
                for (uint256 i; i < m.length; i++) {
                    while (answers[next].length > 0) {
                        next++;
                    }
                    if (_isNullAnswer(m[i])) {
                        calls[need++] = calls[i];
                    } else {
                        answers[next] = m[i];
                    }
                    ++next;
                }
                if (need == 0) {
                    return abi.encode(state.answers);
                }
                assembly {
                    mstore(calls, need) // truncate
                }
            }
        } else if (_isNullAnswer(unwrapped)) {
            state.answers[0] = unwrapped;
        } else {
            return unwrapped;
        }
        return _callNext(state);
    }

    function resolveCallbackError(
        bytes calldata,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        return _callNext(abi.decode(extraData, (State)));
    }

    function _isNullAnswer(bytes memory v) internal pure returns (bool) {
        return
            BytesUtils.isZeros(v) ||
            keccak256(v) ==
            0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd; // abi.encode('')
    }
}
