// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../resolvers/profiles/IExtendedDNSResolver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract DummyExtendedDNSSECResolver is IExtendedDNSResolver, IERC165 {
    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return interfaceId == type(IExtendedDNSResolver).interfaceId;
    }

    function resolve(
        bytes memory /* name */,
        bytes memory /* data */,
        bytes memory context
    ) external view override returns (bytes memory) {
        return abi.encode(context);
    }
}
