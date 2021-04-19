pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

//import "@ensdomains/ens/contracts/ENS.sol";

/**
 * @dev A basic interface for ENS resolvers.
 */
interface Resolver {
    function supportsInterface(bytes4 interfaceID) external pure returns (bool);

    function setAuthorisation(
        bytes32 node,
        address target,
        bool isAuthorised
    ) external;

    function addr(bytes32 node) external view returns (address);

    function setAddr(bytes32 node, address addr) external;

    function checkCallData(bytes32 node, bytes[] calldata data)
        external
        pure
        returns (bool);

    function safeMulticall(bytes32 node, bytes[] calldata data)
        external
        returns (bytes[] memory results);
}
