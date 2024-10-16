// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../../contracts/resolvers/profiles/IAddrResolver.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

contract DummyAddrOffchainResolver is IAddrResolver, ERC165 {
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IAddrResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function addr(bytes32) external view returns (address payable) {
        string[] memory urls = new string[](1);
        urls[0] = "https://example.com/";

        bytes memory data = abi.encode(address(this));

        revert OffchainLookup(
            address(this),
            urls,
            data,
            this.addrCallback.selector,
            data
        );
    }

    function addrOnchain(bytes32) external view returns (address) {
        return address(this);
    }

    function addrCallback(
        bytes calldata response,
        bytes calldata /* extraData */
    ) external pure returns (address) {
        return abi.decode(response, (address));
    }
}
