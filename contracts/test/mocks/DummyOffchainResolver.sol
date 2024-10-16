// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../../../contracts/resolvers/profiles/ITextResolver.sol";
import "../../../contracts/resolvers/profiles/IExtendedResolver.sol";

error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

contract DummyOffchainResolver is IExtendedResolver, ERC165 {
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

        if (bytes4(data) == bytes4(0x12345678)) {
            return abi.encode("foo");
        }
        revert OffchainLookup(
            address(this),
            urls,
            data,
            DummyOffchainResolver.resolveCallback.selector,
            data
        );
    }

    function addr(bytes32) external pure returns (address) {
        return 0x69420f05A11f617B4B74fFe2E04B2D300dFA556F;
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata extraData
    ) external pure returns (bytes memory) {
        if (bytes4(extraData) == bytes4(keccak256("emptyResponse()"))) {
            revert();
        }
        if (bytes4(extraData) == bytes4(keccak256("revertWithData()"))) {
            revert("Unsupported call");
        }
        if (bytes4(extraData) != bytes4(keccak256("multicall(bytes[])"))) {
            return response;
        }

        bytes[] memory results = abi.decode(response, (bytes[]));
        bytes[] memory calls = abi.decode(extraData[4:], (bytes[]));
        for (uint256 i = 0; i < calls.length; i++) {
            if (
                bytes4(calls[i]) == bytes4(keccak256("text(bytes32,string)")) ||
                bytes4(calls[i]) == bytes4(keccak256("addr(bytes32)")) ||
                bytes4(calls[i]) ==
                bytes4(keccak256("addr(bytes32,uint256)")) ||
                bytes4(calls[i]) == bytes4(keccak256("name(bytes32)"))
            ) {
                calls[i] = results[i];
            } else if (
                bytes4(calls[i]) == bytes4(keccak256("emptyResponse()"))
            ) {
                calls[i] = "";
            } else {
                revert("Unsupported call");
            }
        }
        return abi.encode(calls);
    }
}
