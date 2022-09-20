// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./ResolverBase.sol";
import "./IClearableResolver.sol";

abstract contract ClearableResolver is IClearableResolver, ResolverBase {
    mapping(bytes32 => uint64) clearIndexes;

    function clearIndex(bytes32 node) external view returns (uint64) {
        return clearIndexes[node];
    }

    /**
     * Increments the clear index associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     */
    function clear(bytes32 node) public virtual authorised(node) {
        setClear(node, clearIndexes[node] + 1);
    }

    /**
     * Increments the clear index associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     * @param newIndex The new clear index.
     */
    function setClear(bytes32 node, uint64 newIndex)
        public
        virtual
        authorised(node)
    {
        emit RecordsCleared(node, newIndex);
        clearIndexes[node] = newIndex;
    }

    function supportsInterface(bytes4 interfaceID)
        public
        view
        virtual
        override
        returns (bool)
    {
        return
            interfaceID == type(IClearableResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
