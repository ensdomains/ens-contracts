// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;
import "./IDelegatableResolverRegistrar.sol";
import "./DelegatableResolver.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * A delegated resolver registrar that allows anyone to register subname
 */
contract DelegatableResolverRegistrar is IDelegatableResolverRegistrar, ERC165 {
    DelegatableResolver public resolver;

    constructor(DelegatableResolver _resolver) {
        resolver = _resolver;
    }

    /**
     * @dev Approve an operator to be able to updated records on a node.
     * @param name      The encoded subname
     * @param operator  The address to approve
     */

    function register(bytes memory name, address operator) external {
        (bytes32 node, bool authorized) = resolver.getAuthorisedNode(
            name,
            0,
            operator
        );
        if (authorized == false) {
            resolver.approve(name, operator, true);
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IDelegatableResolverRegistrar).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
