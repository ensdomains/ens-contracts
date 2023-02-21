//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import "./PublicResolver.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PublicResolverWithFallback is PublicResolver, Ownable {
    mapping(string => string) public fallback_text_uris;

    constructor(
        ENS _ens,
        INameWrapper wrapperAddress,
        address _trustedETHController,
        address _trustedReverseRegistrar
    )
        PublicResolver(
            _ens,
            wrapperAddress,
            _trustedETHController,
            _trustedReverseRegistrar
        )
    {}

    /**
     * Sets the fallback text URI for all nodes on this resolver.
     * URIs must be resolvable via HTTPS GET, and must allow the node to be appended to the end.
     * @param key The key to set.
     * @param uri The URI to set.
     */
    function setFallbackTextURI(
        string calldata key,
        string calldata uri
    ) external onlyOwner {
        fallback_text_uris[key] = uri;
    }

    /**
     * Returns the text data associated with an ENS node and key.
     * @param node The ENS node to query.
     * @param key The text data key to query.
     * @return record The associated text data.
     */
    function text(
        bytes32 node,
        string calldata key
    ) public view virtual override returns (string memory record) {
        record = super.text(node, key);
        if (
            bytes(record).length == 0 &&
            bytes(fallback_text_uris[key]).length > 0
        ) {
            record = string.concat(
                fallback_text_uris[key],
                Strings.toHexString(uint256(node), 32)
            );
        }
    }
}
