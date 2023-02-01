//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {INameWrapper, PARENT_CANNOT_CONTROL, IS_DOT_ETH} from "../wrapper/INameWrapper.sol";

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

abstract contract BaseSubdomainRegistrar {
    INameWrapper public immutable wrapper;

    event NameRegistered(bytes32 node, uint256 expiry);
    event NameRenewed(bytes32 node, uint256 expiry);
    uint64 private GRACE_PERIOD = 90 days;

    constructor(address _wrapper) {
        wrapper = INameWrapper(_wrapper);
    }

    modifier onlyOwner(bytes32 node) {
        if (!wrapper.canModifyName(node, msg.sender)) {
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
            uint32 fuses,
            uint64 expiry
        ) {
            if (fuses & IS_DOT_ETH == IS_DOT_ETH) {
                expiry = expiry - GRACE_PERIOD;
            }

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
