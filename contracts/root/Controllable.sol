pragma solidity ^0.8.4;

import "./Ownable.sol";

contract Controllable is Ownable {
    mapping(address=>bool) public controllers;

    event ControllerChanged(address indexed controller, bool enabled);

    modifier onlyController {
        require(controllers[msg.sender]);
        _;
    }

    function setController(address controller, bool enabled) public onlyOwner {
        controllers[controller] = enabled;
        emit ControllerChanged(controller, enabled);
    }
}
