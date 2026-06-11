//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

import {IETHRegistrarController} from "../ethregistrar/IETHRegistrarController.sol";

interface ISimplexReentry {
    function register(
        IETHRegistrarController.Registration calldata registration
    ) external payable;

    function commit(bytes32 commitment) external;

    function withdraw() external;
}

/// @dev Test-only malicious resolver. `SimplexController.register` invokes
///      `multicallWithNodeCheck` on the registration's resolver while the
///      `nonReentrant` lock is held, so this mock re-enters the controller from
///      there to prove the guard reverts. `mode`: 0 = register, 1 = commit,
///      2 = withdraw.
contract ReentrantResolver {
    ISimplexReentry public immutable controller;
    uint8 public mode;

    constructor(address controller_) {
        controller = ISimplexReentry(controller_);
    }

    function setMode(uint8 mode_) external {
        mode = mode_;
    }

    /// @dev The function `SimplexController.register` calls when a registration
    ///      supplies resolver data. The arguments are ignored; we only use the
    ///      call as a re-entry point.
    function multicallWithNodeCheck(
        bytes32,
        bytes[] calldata
    ) external returns (bytes[] memory results) {
        if (mode == 0) {
            IETHRegistrarController.Registration memory r;
            controller.register(r);
        } else if (mode == 1) {
            controller.commit(bytes32(0));
        } else {
            controller.withdraw();
        }
        return new bytes[](0);
    }

    receive() external payable {}
}
