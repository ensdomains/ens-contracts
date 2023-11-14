pragma solidity >=0.8.4;
import "./DelegatableResolver.sol";
import {Clone} from "clones-with-immutable-args/src/Clone.sol";

/**
 * A delegated resolver registrar that allows anyone to register subname
 */
contract DelegatableResolverRegistrar is Clone {
    DelegatableResolver public resolver;

    function getResolver() public view returns (address) {
        return _getArgAddress(0);
    }

    /**
     * @dev Approve an operator to be able to updated records on a node.
     */
    function register(bytes memory name, address newowner) external {
        bytes32 node = bytes32(0);
        address owner = address(0);
        DelegatableResolver resolver = DelegatableResolver(getResolver());
        (node, owner) = resolver.getAuthorisedNode(name, 0);
        if (owner == address(0)) {
            resolver.approve(name, newowner, true);
        } else {
            revert("The name is taken");
        }
    }
}
