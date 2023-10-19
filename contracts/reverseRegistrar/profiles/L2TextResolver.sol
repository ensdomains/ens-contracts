// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./L2ReverseResolverBase.sol";
import "../../resolvers/profiles/ITextResolver.sol";

abstract contract L2TextResolver is ITextResolver, L2ReverseResolverBase {
    mapping(uint64 => mapping(bytes32 => mapping(string => string))) versionable_texts;

    function _setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) internal {
        versionable_texts[recordVersions[node]][node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    /**
     * Returns the text data associated with an ENS node and key.
     * @param node The ENS node to query.
     * @param key The text data key to query.
     * @return The associated text data.
     */
    function text(
        bytes32 node,
        string calldata key
    ) external view virtual override returns (string memory) {
        return versionable_texts[recordVersions[node]][node][key];
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(ITextResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
