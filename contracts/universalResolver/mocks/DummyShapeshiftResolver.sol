// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC7996} from "../../utils/IERC7996.sol";
import {
    IExtendedResolver
} from "../../resolvers/profiles/IExtendedResolver.sol";
import {
    IExtendedDNSResolver
} from "../../resolvers/profiles/IExtendedDNSResolver.sol";
import {IMulticallable} from "../../resolvers/IMulticallable.sol";
import {OffchainLookup} from "../../ccipRead/EIP3668.sol";
import {BytesUtils} from "../../utils/BytesUtils.sol";

/// @dev This resolver can perform all resolver permutations.
///      When this contract triggers OffchainLookup(), it uses a data-url, so no server is required.
///      The actual response is set using `setResponse()`.
contract DummyShapeshiftResolver is
    IExtendedResolver,
    IExtendedDNSResolver,
    IERC165,
    IERC7996
{
    // https://github.com/ensdomains/ensips/pull/18
    error UnsupportedResolverProfile(bytes4 call);

    mapping(bytes => bytes) _responses;
    mapping(bytes4 => bool) public features;
    string public revertURL = 'data:application/json,{"data":"0x"}';
    uint256 public featureCount;
    bool public isERC165 = true; // default
    bool public isExtended;
    bool public isExtendedDNS;
    bool public isOffchain;
    bool public revertUnsupported;
    bool public revertEmpty;
    bool public deriveMulticall;

    function getResponse(bytes memory call) public view returns (bytes memory) {
        if (
            deriveMulticall && bytes4(call) == IMulticallable.multicall.selector
        ) {
            bytes[] memory m = abi.decode(
                BytesUtils.substring(call, 4, call.length - 4),
                (bytes[])
            );
            for (uint256 i; i < m.length; i++) {
                m[i] = _responses[m[i]];
            }
            return abi.encode(m);
        } else {
            return _responses[call];
        }
    }

    function setResponse(bytes memory req, bytes memory res) external {
        _responses[req] = res;
    }

    function setDeriveMulticall(bool x) external {
        deriveMulticall = x;
    }

    function setRevertURL(string memory url) external {
        revertURL = url;
    }

    function setFeature(bytes4 feature, bool on) external {
        if (features[feature] != on) {
            features[feature] = on;
            featureCount = on ? featureCount + 1 : featureCount - 1;
        }
    }

    function setOld(bool x) external {
        isERC165 = !x;
        if (x) {
            isExtended = false;
            isExtendedDNS = false;
        }
    }

    function setExtended(bool x) external {
        isExtended = x;
        if (x) isERC165 = true;
    }

    function setExtendedDNS(bool x) external {
        isExtendedDNS = x;
        if (x) isERC165 = true;
    }

    function setOffchain(bool x) external {
        isOffchain = x;
    }

    function setRevertUnsupportedResolverProfile(bool x) external {
        revertUnsupported = x;
    }

    function setRevertEmpty(bool x) external {
        revertEmpty = x;
    }

    fallback() external {
        if (msg.data.length < 4) return;
        if (isExtended || isExtendedDNS) return;
        bytes memory v = getResponse(msg.data);
        if (v.length == 0) {
            if (revertEmpty) {
                assembly {
                    revert(0, 0)
                }
            }
            return;
        }
        if (isOffchain) _revertOffchain(v);
        _revertIfError(v);
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function supportsInterface(bytes4 x) external view returns (bool) {
        if (!isERC165) {
            assembly {
                return(0, 0)
            }
        }
        return
            type(IERC165).interfaceId == x ||
            (isExtended && type(IExtendedResolver).interfaceId == x) ||
            (isExtendedDNS && type(IExtendedDNSResolver).interfaceId == x) ||
            (type(IERC7996).interfaceId == x && featureCount > 0);
    }

    function supportsFeature(bytes4 x) external view returns (bool) {
        return features[x];
    }

    function resolve(
        bytes memory,
        bytes memory call
    ) external view returns (bytes memory) {
        if (!isExtended) {
            assembly {
                return(0, 0)
            }
        }
        bytes memory v = getResponse(call);
        if (v.length == 0 && revertUnsupported) {
            revert UnsupportedResolverProfile(bytes4(call));
        }
        if (isOffchain) _revertOffchain(v);
        _revertIfError(v);
        return v;
    }

    function resolve(
        bytes memory,
        bytes memory call,
        bytes memory
    ) external view returns (bytes memory) {
        if (!isExtendedDNS) {
            assembly {
                return(0, 0)
            }
        }
        bytes memory v = getResponse(call);
        if (v.length == 0 && revertUnsupported) {
            revert UnsupportedResolverProfile(bytes4(call));
        }
        if (isOffchain) _revertOffchain(v);
        _revertIfError(v);
        return v;
    }

    function _revertOffchain(bytes memory v) internal view {
        string[] memory urls = new string[](1);
        urls[0] = revertURL;
        revert OffchainLookup(
            address(this),
            urls,
            "",
            this.callback.selector,
            v
        );
    }

    function callback(
        bytes memory,
        bytes memory v
    ) external view returns (bytes memory) {
        _revertIfError(v);
        if (isExtended || isExtendedDNS) return v;
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function _revertIfError(bytes memory v) internal pure {
        if ((v.length & 31) != 0) {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
    }
}
