//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {IMetadataRenderer} from "../ethregistrar/IMetadataRenderer.sol";

/// @notice Fully on-chain ERC-721 metadata for SimpleX names. The BaseRegistrar
///         holds a pointer to this contract and delegates tokenURI here, passing
///         the stored plaintext label. Swappable via the registrar owner, so a
///         rendering change is an explicit on-chain event rather than a silent
///         off-chain edit. Renders a self-contained data: URI (JSON + SVG), so
///         no server or IPFS is required.
contract MetadataRenderer is IMetadataRenderer {
    /// @dev TLD suffix including the leading dot, eg ".testing".
    string public suffix;

    constructor(string memory _suffix) {
        suffix = _suffix;
    }

    /// @inheritdoc IMetadataRenderer
    function tokenURI(
        uint256,
        string calldata label
    ) external view returns (string memory) {
        string memory name = string.concat(label, suffix);
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="#0053D0"/>',
            '<stop offset="100%" stop-color="#001A4D"/>',
            "</linearGradient></defs>",
            '<rect width="500" height="500" fill="url(#g)"/>',
            '<text x="250" y="265" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle">',
            _xmlEscape(name),
            "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"',
            _jsonEscape(name),
            '","description":"A SimpleX name. Resolves to SimpleX contact and channel links.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return
            string.concat(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            );
    }

    /// @dev Escapes a string for inclusion in a JSON string literal: backslash
    ///      and double-quote are escaped; control bytes are replaced with space.
    function _jsonEscape(
        string memory s
    ) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 2);
        uint256 j;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") {
                out[j++] = "\\";
                out[j++] = c;
            } else if (uint8(c) < 0x20) {
                out[j++] = " ";
            } else {
                out[j++] = c;
            }
        }
        assembly {
            mstore(out, j)
        }
        return string(out);
    }

    /// @dev Escapes a string for inclusion in XML/SVG text content.
    function _xmlEscape(
        string memory s
    ) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 6);
        uint256 j;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == "&") j = _append(out, j, "&amp;");
            else if (c == "<") j = _append(out, j, "&lt;");
            else if (c == ">") j = _append(out, j, "&gt;");
            else if (c == '"') j = _append(out, j, "&quot;");
            else if (c == "'") j = _append(out, j, "&apos;");
            else out[j++] = c;
        }
        assembly {
            mstore(out, j)
        }
        return string(out);
    }

    function _append(
        bytes memory out,
        uint256 j,
        bytes memory frag
    ) private pure returns (uint256) {
        for (uint256 k; k < frag.length; k++) out[j++] = frag[k];
        return j;
    }
}
