// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../../contracts/resolvers/profiles/INameResolver.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

contract DummyNameOffchainResolver is INameResolver, ERC165 {
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(INameResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function name(bytes32) external view returns (string memory) {
        string[] memory urls = new string[](1);
        urls[0] = "https://example.com/";

        bytes memory data = abi.encode("name-offchain.eth");

        revert OffchainLookup(
            address(this),
            urls,
            data,
            this.nameCallback.selector,
            data
        );
    }

    function nameCallback(
        bytes calldata response,
        bytes calldata /* extraData */
    ) external pure returns (string memory) {
        return abi.decode(response, (string));
    }
}
