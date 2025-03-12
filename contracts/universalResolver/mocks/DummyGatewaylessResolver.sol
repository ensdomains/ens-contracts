// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "../../resolvers/profiles/IExtendedResolver.sol";
import {OffchainLookup} from "../../ccipRead/EIP3668.sol";
//import {IResolveMulticall} from "../../resolvers/IResolveMulticall.sol";

// this will trigger OffchainLookup() flow so no server is required
// the actual response is set using `setResponse()`

error UnknownCall(bytes call);

contract DummyGatewaylessResolver is IExtendedResolver, IERC165 {
    mapping(bytes => bytes) public responses;

    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            type(IERC165).interfaceId == x ||
            type(IExtendedResolver).interfaceId == x;
    }

    function resolve(
        bytes memory,
        bytes memory call
    ) external view returns (bytes memory) {
        bytes memory res = responses[call];
        if (res.length == 0) revert UnknownCall(call);
        string[] memory urls = new string[](1);
        urls[0] = 'data:application/json,{"data":"0x","forceGET":"{data}"}';
        revert OffchainLookup(
            address(this),
            urls,
            "",
            this.resolveCallback.selector,
            res
        );
    }

    function resolveCallback(
        bytes memory,
        bytes memory carry
    ) external pure returns (bytes memory) {
        return carry;
    }

    function setResponse(bytes memory req, bytes memory res) public {
        responses[req] = res;
    }

    // function enableMulticall(bytes[] memory calls) external {
    //     bytes[] memory m = new bytes[](calls.length);
    //     for (uint256 i; i < calls.length; i++) {
    //         m[i] = responses[calls[i]];
    //     }
    //     setOffchainResponse(
    //         abi.encodeCall(IResolveMulticall.multicall, (calls)),
    //         abi.encode(m)
    //     );
    // }
}
