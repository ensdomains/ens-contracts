import {INameWrapper, PARENT_CANNOT_CONTROL} from "../wrapper/INameWrapper.sol";

error Unavailable();
error Unauthorised(bytes32 node);
error InsufficientFunds();
error NameNotRegistered();
error InvalidTokenAddress(address);
error NameNotSetup(bytes32 node);
error DataMissing();
error ParentExpired(bytes32 node);
error ParentNotWrapped(bytes32 node);
error ParentWillHaveExpired(bytes32 node);
error DurationTooLong(bytes32 node);

contract BaseSubdomainRegistrar {
    event NameRegistered(bytes32 node, uint256 expiry);
    event NameRenewed(bytes32 node, uint256 expiry);

    constructor(INameWrapper _wrapper) {
        wrapper = _wrapper;
    }

    modifier onlyOwner(bytes32 node) {
        if (!wrapper.isTokenOwnerOrApproved(node, msg.sender)) {
            revert Unauthorised(node);
        }
        _;
    }
    modifier canBeRegistered(bytes32 parentNode, uint64 duration) {
        _checkParent(parentNode, duration);
        _;
    }

    /* Internal Functions */

    function _checkParent(bytes32 node, uint256 duration) internal {
        try wrapper.getData(uint256(node)) returns (
            address,
            uint32,
            uint64 expiry
        ) {
            if (block.timestamp > expiry) {
                revert ParentExpired(node);
            }

            if (duration + block.timestamp > expiry) {
                revert ParentWillHaveExpired(node);
            }
        } catch {
            revert ParentNotWrapped(node);
        }
    }
}
