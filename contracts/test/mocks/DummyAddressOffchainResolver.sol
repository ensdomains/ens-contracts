// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../../contracts/resolvers/profiles/IAddressResolver.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

contract DummyAddressOffchainResolver is IAddressResolver, ERC165 {
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IAddressResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function addr(
        bytes32 node,
        uint256 coinType
    ) external view returns (bytes memory) {
        string[] memory urls = new string[](1);
        urls[0] = "https://example.com/";

        bytes memory data = abi.encodeWithSelector(
            this.addr.selector,
            node,
            coinType
        );

        revert OffchainLookup(
            address(this),
            urls,
            data,
            this.addrCallback.selector,
            data
        );
    }

    function addrCallback(
        bytes calldata response,
        bytes calldata /* extraData */
    ) external pure returns (bytes memory) {
        return abi.decode(response, (bytes));
    }
}
