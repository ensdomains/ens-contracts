// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./profiles/IVersionableResolver.sol";

error NotAuthorised();
error NotClearable();

abstract contract ResolverBase is ERC165, IVersionableResolver {
    mapping(bytes32 => uint64) public recordVersions;
    mapping(bytes32 => bool) private unclearable;
    mapping(bytes32 => bool) private allRecordsLocked;

    event AllRecordsLocked(bytes32 indexed node);

    function isAuthorised(bytes32 node) internal view virtual returns (bool);

    modifier authorised(bytes32 node) {
        if (!isAuthorised(node)) {
            revert NotAuthorised();
        }
        _;
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     */
    function clearRecords(bytes32 node) public virtual authorised(node) {
        if (unclearable[node]) {
            revert NotClearable();
        }
        recordVersions[node]++;
        emit VersionChanged(node, recordVersions[node]);
    }

    /**
     * Returns true if all records for this node have been locked.
     * @param node The node to check.
     */
    function isAllLocked(bytes32 node) public view virtual returns (bool) {
        return allRecordsLocked[node];
    }

    /**
     * Locks all records for this ENS node.
     * @param node The ENS node to lock.
     */
    function lockAll(bytes32 node) public virtual authorised(node) {
        allRecordsLocked[node] = true;
        _setUnclearable(node);
        emit AllRecordsLocked(node);
    }

    function _setUnclearable(bytes32 node) internal {
        unclearable[node] = true;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IVersionableResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
