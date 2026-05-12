//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IBaseRegistrar} from "../ethregistrar/IBaseRegistrar.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {Controllable} from "../wrapper/Controllable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MigrationHelper is Ownable, Controllable {
    IBaseRegistrar public immutable registrar;
    INameWrapper public immutable wrapper;
    address public migrationTarget;

    error MigrationTargetNotSet();

    event MigrationTargetUpdated(address indexed target);

    constructor(IBaseRegistrar _registrar, INameWrapper _wrapper) {
        registrar = _registrar;
        wrapper = _wrapper;
    }

    function setMigrationTarget(address target) external onlyOwner {
        migrationTarget = target;
        emit MigrationTargetUpdated(target);
    }

    function migrateNames(
        address nameOwner,
        uint256[] memory tokenIds,
        bytes memory data
    ) external onlyController {
        if (migrationTarget == address(0)) {
            revert MigrationTargetNotSet();
        }

        for (uint256 i = 0; i < tokenIds.length; i++) {
            registrar.safeTransferFrom(
                nameOwner,
                migrationTarget,
                tokenIds[i],
                data
            );
        }
    }

    function migrateWrappedNames(
        address nameOwner,
        uint256[] memory tokenIds,
        bytes memory data
    ) external onlyController {
        if (migrationTarget == address(0)) {
            revert MigrationTargetNotSet();
        }

        uint256[] memory amounts = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            amounts[i] = 1;
        }
        wrapper.safeBatchTransferFrom(
            nameOwner,
            migrationTarget,
            tokenIds,
            amounts,
            data
        );
    }
}
