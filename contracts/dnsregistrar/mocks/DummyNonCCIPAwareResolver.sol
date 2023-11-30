// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../OffchainDNSResolver.sol";
import "../../resolvers/profiles/IExtendedResolver.sol";

contract DummyNonCCIPAwareResolver is IExtendedResolver, ERC165 {
    OffchainDNSResolver dnsResolver;

    constructor(OffchainDNSResolver _dnsResolver) {
        dnsResolver = _dnsResolver;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function resolve(
        bytes calldata /* name */,
        bytes calldata data
    ) external view returns (bytes memory) {
        string[] memory urls = new string[](1);
        urls[0] = "https://example.com/";
        revert OffchainLookup(
            address(dnsResolver),
            urls,
            data,
            OffchainDNSResolver.resolveCallback.selector,
            data
        );
    }
}
