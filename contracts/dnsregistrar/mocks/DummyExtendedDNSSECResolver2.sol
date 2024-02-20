// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../../resolvers/profiles/IExtendedDNSResolver.sol";
import "../../resolvers/profiles/IAddressResolver.sol";
import "../../resolvers/profiles/IAddrResolver.sol";
import "../../resolvers/profiles/ITextResolver.sol";
import "../../utils/HexUtils.sol";

contract DummyExtendedDNSSECResolver2 is IExtendedDNSResolver, IERC165 {
    using HexUtils for *;

    uint256 private constant COIN_TYPE_ETH = 60;
    uint256 private constant ADDRESS_LENGTH = 40;

    error NotImplemented();
    error InvalidAddressFormat();

    function supportsInterface(
        bytes4 interfaceId
    ) external view virtual override returns (bool) {
        return interfaceId == type(IExtendedDNSResolver).interfaceId;
    }

    function resolve(
        bytes calldata /* name */,
        bytes calldata data,
        bytes calldata context
    ) external pure override returns (bytes memory) {
        bytes4 selector = bytes4(data);
        if (
            selector == IAddrResolver.addr.selector ||
            selector == IAddressResolver.addr.selector
        ) {
            // Parse address from context
            bytes memory addrBytes = _parseAddressFromContext(context);
            return abi.encode(address(uint160(uint256(bytes32(addrBytes)))));
        } else if (selector == ITextResolver.text.selector) {
            // Parse text value from context
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            string memory value = _parseTextFromContext(context, key);
            return abi.encode(value);
        }
        revert NotImplemented();
    }

    function _parseAddressFromContext(
        bytes memory context
    ) internal pure returns (bytes memory) {
        // Parse address from concatenated context
        for (uint256 i = 0; i < context.length - ADDRESS_LENGTH + 2; i++) {
            if (context[i] == "0" && context[i + 1] == "x") {
                bytes memory candidate = new bytes(ADDRESS_LENGTH);
                for (uint256 j = 0; j < ADDRESS_LENGTH; j++) {
                    candidate[j] = context[i + j + 2];
                }

                (address candidateAddr, bool valid) = candidate.hexToAddress(
                    0,
                    ADDRESS_LENGTH
                );
                if (valid) {
                    return abi.encode(candidateAddr);
                }
            }
        }
        revert InvalidAddressFormat();
    }

    function _parseTextFromContext(
        bytes calldata context,
        string memory key
    ) internal pure returns (string memory) {
        // Parse key-value pairs from concatenated context
        string memory value = "";
        bool foundKey = false;
        for (uint256 i = 0; i < context.length; i++) {
            if (foundKey && context[i] == "=") {
                i++;
                while (i < context.length && context[i] != " ") {
                    string memory charStr = string(
                        abi.encodePacked(bytes1(context[i]))
                    );
                    value = string(abi.encodePacked(value, charStr));
                    i++;
                }
                return value;
            }
            if (!foundKey && bytes(key)[0] == context[i]) {
                bool isMatch = true;
                for (uint256 j = 1; j < bytes(key).length; j++) {
                    if (context[i + j] != bytes(key)[j]) {
                        isMatch = false;
                        break;
                    }
                }
                foundKey = isMatch;
            }
        }
        return "";
    }
}
