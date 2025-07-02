// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../../contracts/wrapper/IMetadataService.sol";

/**
 * @title MockMetadataService
 * @dev Shared mock metadata service for testing NameWrapper functionality
 */
contract MockMetadataService is IMetadataService {
    function uri(uint256 tokenId) external pure override returns (string memory) {
        return string(abi.encodePacked("https://metadata.example.com/", _toString(tokenId)));
    }
    
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}