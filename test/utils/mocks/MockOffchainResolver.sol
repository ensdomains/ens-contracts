// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../../contracts/resolvers/profiles/IExtendedResolver.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

contract MockOffchainResolver is IExtendedResolver, ERC165 {
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function resolve(
        bytes calldata /* name */,
        bytes calldata data
    ) external view returns (bytes memory) {
        string[] memory urls = new string[](1);
        urls[0] = "https://example.com/";
        revert OffchainLookup(
            address(this),
            urls,
            data,
            MockOffchainResolver.resolveCallback.selector,
            data
        );
    }

    function addr(bytes32) external pure returns (bytes memory) {
        return abi.encode("onchain");
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        (, bytes memory callData, ) = abi.decode(
            extraData,
            (bytes, bytes, bytes4)
        );
        if (bytes4(callData) == bytes4(keccak256("addr(bytes32)"))) {
            (bytes memory result, , ) = abi.decode(
                response,
                (bytes, uint64, bytes)
            );
            return result;
        }
        return abi.encode(address(this));
    }
}
