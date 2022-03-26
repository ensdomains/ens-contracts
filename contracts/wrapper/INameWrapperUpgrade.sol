pragma solidity ^0.8.4;

interface INameWrapperUpgrade {

    function wrap(
        bytes calldata name,
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) external;

    function wrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) external;

    function upgradeETH2LD(
        string calldata label,
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) external;

    function upgrade(
        bytes calldata name,
        address wrappedOwner,
        uint96 _fuses,
        address resolver
    ) external;

}
