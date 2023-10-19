// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./L2ReverseResolverBase.sol";
import "../../resolvers/profiles/ITextResolver.sol";

abstract contract L2TextResolver is ITextResolver, L2ReverseResolverBase {
    mapping(uint64 => mapping(bytes32 => mapping(string => string))) versionable_texts;

    /**
     * Sets the text data associated with an ENS node and key.
     * May only be called by the owner of that node in the ENS registry.
     * @param addr The node to update.
     * @param key The key to set.
     * @param value The text data value to set.
     */
    function setText(
        address addr,
        string calldata key,
        string calldata value
    ) external authorised(addr) {
        bytes32 labelHash = sha3HexAddress(addr);
        bytes32 reverseNode = keccak256(
            abi.encodePacked(L2_REVERSE_NODE, labelHash)
        );
        versionable_texts[recordVersions[reverseNode]][reverseNode][
            key
        ] = value;
        emit TextChanged(reverseNode, key, key, value);
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
