// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "../../resolvers/profiles/IExtendedResolver.sol";
import {OffchainLookup} from "../../ccipRead/EIP3668.sol";
//import {IResolveMulticall} from "../../resolvers/IResolveMulticall.sol";

// this resolver can perform all resolver permutations
// when this contract triggers OffchainLookup(), it uses a data-url, so no server is required
// the actual response is set using `setResponse()`

// https://github.com/ensdomains/ensips/pull/18
error UnsupportedResolverProfile(bytes4 call);

contract DummyShapeshiftResolver is IExtendedResolver, IERC165 {
    mapping(bytes => bytes) public responses;
    bool public isERC165 = true; // default
    bool public isExtended;
    bool public isOffchain;
    bool public revertUnsupported;
    bool public revertEmpty;
    //bool public isWrapperSafe;
    //bool public isResolveMulticallable;

    function setResponse(bytes memory req, bytes memory res) external {
        responses[req] = res;
    }

    function setOld() external {
        isERC165 = false;
        isExtended = false;
    }

    function setExtended(bool x) external {
        isERC165 = true;
        isExtended = x;
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
        if (isExtended) return;
        bytes memory v = responses[msg.data];
        if (v.length == 0) {
            if (revertEmpty) {
                assembly {
                    revert(0, 0)
                }
            }
            return;
        }
        if (isOffchain) _revertOffchain(v);
        _revertfError(v);
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
            (type(IExtendedResolver).interfaceId == x && isExtended);
    }

    function resolve(
        bytes memory,
        bytes memory call
    ) external view returns (bytes memory) {
        bytes memory v = responses[call];
        if (v.length == 0 && revertUnsupported) {
            revert UnsupportedResolverProfile(bytes4(call));
        }
        if (isOffchain) _revertOffchain(v);
        _revertfError(v);
        return v;
    }

    function _revertOffchain(bytes memory v) internal view {
        string[] memory urls = new string[](1);
        urls[0] = 'data:application/json,{"data":"0x"}';
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
        _revertfError(v);
        if (isExtended) return v;
        assembly {
            return(add(v, 32), mload(v))
        }
    }

    function _revertfError(bytes memory v) internal pure {
        if ((v.length & 31) != 0) {
            assembly {
                revert(add(v, 32), mload(v))
            }
        }
    }

    // function enableMulticall(bytes[] memory calls) external {
    //     bytes[] memory m = new bytes[](calls.length);
    //     for (uint256 i; i < calls.length; i++) {
    //         m[i] = responses[calls[i]];
    //     }
    //     setResponse(
    //         abi.encodeCall(IResolveMulticall.multicall, (calls)),
    //         abi.encode(m)
    //     );
    // }
}
