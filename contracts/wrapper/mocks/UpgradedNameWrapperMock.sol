//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
import "../INameWrapper.sol";
import "../../registry/ENS.sol";
import "../../ethregistrar/IBaseRegistrar.sol";

contract NameWrapperUpgraded {
    address public immutable oldNameWrapper;
    ENS public immutable ens;
    IBaseRegistrar public immutable registrar;

    constructor(
        address _oldNameWrapper,
        ENS _ens,
        IBaseRegistrar _registrar
    ) {
        oldNameWrapper = _oldNameWrapper;
        ens = _ens;
        registrar = _registrar;
    }

    event SetSubnodeRecord(
        bytes32 parentNode,
        string label,
        address newOwner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    );

    event WrapETH2LD(
        string label,
        address wrappedOwner,
        uint32 fuses,
        uint64 expiry,
        address resolver
    );

    function wrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint32 fuses,
        uint64 expiry,
        address resolver
    ) public {
        uint256 tokenId = uint256(keccak256(bytes(label)));
        address registrant = registrar.ownerOf(tokenId);
        if (
            registrant != msg.sender &&
            !registrar.isApprovedForAll(registrant, msg.sender)
        ) {
            revert;
        }

        emit WrapETH2LD(label, wrappedOwner, fuses, expiry, resolver);
    }

    function setSubnodeRecord(
        bytes32 parentNode,
        string memory label,
        address newOwner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) public {
        require(
            msg.sender == oldNameWrapper,
            "Not owner/approved or previous nameWrapper controller"
        );
        emit SetSubnodeRecord(
            parentNode,
            label,
            newOwner,
            resolver,
            ttl,
            fuses,
            expiry
        );
    }
}
