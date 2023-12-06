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
     */
    function register(bytes memory name, address operator) external {
        bytes32 node = bytes32(0);
        bool authorized = false;
        (node, authorized) = resolver.getAuthorisedNode(name, 0, operator);
        resolver.approve(name, operator, true);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IDelegatableResolverRegistrar).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
