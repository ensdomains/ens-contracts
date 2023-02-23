// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../../resolvers/profiles/ITextResolver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract DummyLegacyTextResolver is ITextResolver, IERC165 {
    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return interfaceId == type(ITextResolver).interfaceId;
    }

    function text(
        bytes32 /* node */,
        string calldata key
    ) external view override returns (string memory) {
        return key;
    }
}
