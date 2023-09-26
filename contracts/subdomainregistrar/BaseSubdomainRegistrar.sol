//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import {INameWrapper, PARENT_CANNOT_CONTROL, IS_DOT_ETH} from "../wrapper/INameWrapper.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ISubnamePricer} from "./subname-pricers/ISubnamePricer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error Unavailable();
error Unauthorised(bytes32 node);
error NameNotRegistered();
error InvalidTokenAddress(address);
error NameNotSetup(bytes32 node);
error DataMissing();
error ParentExpired(bytes32 node);
error ParentNotWrapped(bytes32 node);
error DurationTooLong(bytes32 node);
error ParentNameNotSetup(bytes32 parentNode);

struct Name {
    ISubnamePricer pricer;
    address beneficiary;
    bool active;
}

abstract contract BaseSubdomainRegistrar {
    mapping(bytes32 => Name) public names;
    INameWrapper public immutable wrapper;
    using Address for address;

    event NameRegistered(bytes32 node, uint256 expiry);
    event NameRenewed(bytes32 node, uint256 expiry);
    event NameSetup(
        bytes32 node,
        address pricer,
        address beneficiary,
        bool active
    );

    uint64 internal GRACE_PERIOD = 90 days;

    constructor(address _wrapper) {
        wrapper = INameWrapper(_wrapper);
    }

    modifier authorised(bytes32 node) {
        if (!wrapper.canModifyName(node, msg.sender)) {
            revert Unauthorised(node);
        }
        _;
    }
    modifier canBeRegistered(bytes32 parentNode, uint64 duration) {
        _checkParent(parentNode, duration);
        _;
    }

    function available(bytes32 node) public view virtual returns (bool) {
        try wrapper.getData(uint256(node)) returns (
            address,
            uint32,
            uint64 expiry
        ) {
            return expiry < block.timestamp;
        } catch {
            return true;
        }
    }

    function setupDomain(
        bytes32 node,
        ISubnamePricer pricer,
        address beneficiary,
        bool active
    ) public authorised(node) {
        names[node] = Name({
            pricer: pricer,
            beneficiary: beneficiary,
            active: active
        });
        emit NameSetup(node, address(pricer), beneficiary, active);
    }

    function batchRegister(
        bytes32 parentNode,
        string[] calldata labels,
        address[] calldata addresses,
        address resolver,
        uint16 fuses,
        uint64 duration,
        bytes[][] calldata records
    ) public {
        if (
            labels.length != addresses.length || labels.length != records.length
        ) {
            revert DataMissing();
        }

        if (!names[parentNode].active) {
            revert ParentNameNotSetup(parentNode);
        }

        _checkParent(parentNode, duration);

        _batchPayBeneficiary(parentNode, labels, duration);

        //double loop to prevent re-entrancy because _register calls user supplied functions

        for (uint256 i = 0; i < labels.length; i++) {
            _register(
                parentNode,
                labels[i],
                addresses[i],
                resolver,
                fuses,
                uint64(block.timestamp) + duration,
                records[i]
            );
        }
    }

    function register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint32 fuses,
        uint64 duration,
        bytes[] calldata records
    ) internal {
        if (!names[parentNode].active) {
            revert ParentNameNotSetup(parentNode);
        }

        (address token, uint256 fee) = ISubnamePricer(names[parentNode].pricer)
            .price(parentNode, label, duration);

        _checkParent(parentNode, duration);

        if (fee > 0) {
            IERC20(token).transferFrom(
                msg.sender,
                address(names[parentNode].beneficiary),
                fee
            );
        }

        _register(
            parentNode,
            label,
            newOwner,
            resolver,
            fuses,
            uint64(block.timestamp) + duration,
            records
        );
    }

    /* Internal Functions */

    function _register(
        bytes32 parentNode,
        string calldata label,
        address newOwner,
        address resolver,
        uint32 fuses,
        uint64 expiry,
        bytes[] calldata records
    ) internal {
        bytes32 node = keccak256(
            abi.encodePacked(parentNode, keccak256(bytes(label)))
        );

        if (!available(node)) {
            revert Unavailable();
        }

        if (records.length > 0) {
            wrapper.setSubnodeOwner(
                parentNode,
                label,
                address(this),
                0,
                expiry
            );
            _setRecords(node, resolver, records);
        }

        wrapper.setSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            0,
            fuses | PARENT_CANNOT_CONTROL, // burn the ability for the parent to control
            expiry
        );

        emit NameRegistered(node, expiry);
    }

    function _batchPayBeneficiary(
        bytes32 parentNode,
        string[] calldata labels,
        uint64 duration
    ) internal {
        ISubnamePricer pricer = names[parentNode].pricer;
        for (uint256 i = 0; i < labels.length; i++) {
            (address token, uint256 price) = pricer.price(
                parentNode,
                labels[i],
                duration
            );
            IERC20(token).transferFrom(
                msg.sender,
                names[parentNode].beneficiary,
                price
            );
        }
    }

    function _setRecords(
        bytes32 node,
        address resolver,
        bytes[] calldata records
    ) internal {
        for (uint256 i = 0; i < records.length; i++) {
            // check first few bytes are namehash
            bytes32 txNamehash = bytes32(records[i][4:36]);
            require(
                txNamehash == node,
                "SubdomainRegistrar: Namehash on record do not match the name being registered"
            );
            resolver.functionCall(
                records[i],
                "SubdomainRegistrar: Failed to set Record"
            );
        }
    }

    function _checkParent(bytes32 parentNode, uint64 duration) internal view {
        uint64 parentExpiry;
        try wrapper.getData(uint256(parentNode)) returns (
            address,
            uint32 fuses,
            uint64 expiry
        ) {
            if (fuses & IS_DOT_ETH == IS_DOT_ETH) {
                expiry = expiry - GRACE_PERIOD;
            }

            if (block.timestamp > expiry) {
                revert ParentExpired(parentNode);
            }
            parentExpiry = expiry;
        } catch {
            revert ParentNotWrapped(parentNode);
        }

        if (duration + block.timestamp > parentExpiry) {
            revert DurationTooLong(parentNode);
        }
    }
}
