//SPDX-License-Identifier: MIT
pragma solidity ~0.8.26;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {IMetadataRenderer} from "../ethregistrar/IMetadataRenderer.sol";

/// @notice Fully on-chain ERC-721 metadata for SimpleX names. The BaseRegistrar
///         holds a pointer to this contract and delegates tokenURI here, passing
///         the stored plaintext label. Renders a self-contained data: URI
///         (JSON + SVG), so no server or IPFS is required. The SVG design is a
///         byte-for-byte port of the reference renderer in the parent SNRC repo
///         (`scripts/nft-preview/gen.mjs`); keep the two in sync.
///
///         Layout heuristic (char-count based, so it works on-chain without
///         glyph metrics): a label up to 8 chars renders on one line filling the
///         width; a longer label keeps that same 8-char single-line font and
///         WRAPS instead of shrinking (label balanced across up to 4 lines, the
///         suffix on its own final line so the dot leads it, up to 5 lines), so
///         a longer name is never bigger than a shorter one. 1.05 is the
///         worst-case bold glyph advance ('m'), keeping a ~5% side margin even
///         for an all-'m' label. Wrapping is balanced and UTF-8-codepoint-safe.
contract MetadataRenderer is IMetadataRenderer {
    using Strings for uint256;

    /// @dev TLD suffix including the leading dot, eg ".testing".
    string public suffix;

    // Official SimpleX brand mark (dark-theme variant, 34x35 viewBox): P1 solid
    // white, P2 filled with the brand cyan->blue gradient.
    string private constant P1 =
        "M3.02958 8.60922L8.622 14.2013L14.3705 8.45375L17.1669 11.2498L11.4183 16.9972L17.0114 22.5895L14.1373 25.4633L8.54422 19.871L2.79636 25.6187L0 22.8227L5.74794 17.075L0.155484 11.483L3.02958 8.60922Z";
    string private constant P2 =
        "M14.0923 25.5156L16.944 22.6642L16.9429 22.6634L22.6467 16.9612L17.0513 11.3675L17.0523 11.367L14.2548 8.56979L8.65972 2.97535L11.5114 0.123963L17.1061 5.71849L22.8099 0.015625L25.6074 2.81285L19.9035 8.51562L25.4984 14.1099L31.2025 8.40729L34 11.2045L28.2958 16.907L33.8917 22.5017L31.0399 25.3531L25.4442 19.7584L19.7409 25.4611L25.3365 31.0559L22.4848 33.9073L16.8892 28.3124L11.1864 34.0156L8.38885 31.2184L14.0923 25.5156Z";
    string private constant DESC =
        "Your SimpleX name for contact address and public channel";

    constructor(string memory _suffix) {
        suffix = _suffix;
    }

    /// @inheritdoc IMetadataRenderer
    function tokenURI(
        uint256,
        string calldata label
    ) external view returns (string memory) {
        string memory name = string.concat(label, suffix);
        string memory svg = _svg(label, suffix);
        string memory json = string.concat(
            '{"name":"',
            _jsonEscape(name),
            '","description":"',
            DESC,
            '","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return
            string.concat(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            );
    }

    function _svg(
        string memory label,
        string memory suffix_
    ) internal pure returns (string memory) {
        (uint256 size, uint256 lines) = _layout(
            bytes(label).length,
            bytes(suffix_).length
        );
        string memory defs = string.concat(
            "<defs>",
            // background: CSS linear-gradient(30deg) black (bottom-left) -> warm
            // white (top-right); userSpaceOnUse endpoints = the 30deg magic-corner
            // line on a 500x500 box (L = 500*sin30 + 500*cos30 = 683.01, centred).
            '<linearGradient id="g" x1="79.25" y1="545.75" x2="420.75" y2="-45.75" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#000000"/><stop offset="52%" stop-color="#131D49"/><stop offset="65%" stop-color="#3F5598"/><stop offset="85%" stop-color="#C3FAFF"/><stop offset="90%" stop-color="#FFF6E0"/></linearGradient>',
            // brand logo gradient (P2): cyan -> blue, official userSpaceOnUse coords
            '<linearGradient id="lg" x1="12.8381" y1="-0.678252" x2="9.54355" y2="31.4493" gradientUnits="userSpaceOnUse"><stop stop-color="#01F1FF"/><stop offset="1" stop-color="#0197FF"/></linearGradient>',
            // name gradient: linear-gradient(90deg, #33CCFF, #64fdff)
            // (start = half-way colour of the old #019bfe->#64fdff ramp, for contrast)
            '<linearGradient id="tg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#33CCFF"/><stop offset="100%" stop-color="#64fdff"/></linearGradient>',
            "</defs>"
        );
        string memory logo = string.concat(
            '<g transform="translate(36,36) scale(1.95)"><path fill-rule="evenodd" clip-rule="evenodd" d="',
            P1,
            '" fill="#ffffff"/><path fill-rule="evenodd" clip-rule="evenodd" d="',
            P2,
            '" fill="url(#lg)"/></g>'
        );
        return
            string.concat(
                '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
                defs,
                '<rect width="500" height="500" fill="url(#g)"/>',
                logo,
                '<text font-family="sans-serif" font-size="',
                size.toString(),
                '" font-weight="bold" fill="url(#tg)" text-anchor="middle">',
                _tspans(bytes(label), bytes(suffix_), size, lines),
                "</text></svg>"
            );
    }

    /// @dev A label up to 8 chars renders on one line filling the width; a longer
    ///      label keeps that 8-char single-line "anchor" font and wraps (label
    ///      balanced across up to 4 lines, suffix on its own final line). size =
    ///      floor(450 / (charsPerLine * 1.05)), with 1.05 encoded as *100 / *105.
    ///      MIN font 14, MAXSIZE 48. Lengths are in bytes (safe over-estimate for
    ///      multibyte labels).
    function _layout(
        uint256 labelLen,
        uint256 suffixLen
    ) internal pure returns (uint256 size, uint256 lines) {
        if (labelLen <= 8) {
            size = (450 * 100) / ((labelLen + suffixLen) * 105);
            if (size > 48) size = 48; // MAXSIZE
            if (size < 14) size = 14; // MIN
            return (size, 1);
        }
        size = (450 * 100) / ((8 + suffixLen) * 105); // 8-char single-line anchor
        uint256 perLine = (450 * 100) / (size * 105); // chars per line at the anchor
        uint256 labelLines = (labelLen + perLine - 1) / perLine; // ceil
        if (labelLines > 4) {
            labelLines = 4;
            perLine = (labelLen + 3) / 4; // ceil(labelLen / 4)
            size = (450 * 100) / (perLine * 105);
        }
        if (size < 14) size = 14; // MIN
        return (size, labelLines + 1);
    }

    /// @dev Dot-aware, UTF-8-safe `<tspan>` lines, vertically centred. One line ->
    ///      the whole name; otherwise the label is balanced across (lines-1) lines
    ///      and the suffix is the final line (so the dot leads it). Each line's
    ///      text is XML-escaped.
    function _tspans(
        bytes memory lb,
        bytes memory sb,
        uint256 size,
        uint256 lines
    ) internal pure returns (string memory) {
        int256 fb = _firstBaseline(size, lines);
        if (lines == 1) {
            return _lineTspan(fb, size, 0, _xmlEscape(string(bytes.concat(lb, sb))));
        }
        // label balanced across (lines-1) lines, then the suffix on the last line
        return
            string.concat(
                _labelLines(lb, size, fb, lines),
                _lineTspan(fb, size, lines - 1, _xmlEscape(string(sb)))
            );
    }

    /// @dev The label's `<tspan>` lines (all but the final suffix line),
    ///      balanced and UTF-8-safe. Split out to keep `_tspans` off the stack.
    function _labelLines(
        bytes memory lb,
        uint256 size,
        int256 fb,
        uint256 lines
    ) private pure returns (string memory out) {
        // ceil(lb.length / (lines - 1)) balanced bytes per label line
        uint256 per = (lb.length + lines - 2) / (lines - 1);
        uint256 pos;
        for (uint256 i = 0; i + 1 < lines; i++) {
            uint256 end = pos + per;
            if (end > lb.length) end = lb.length;
            // don't split a multibyte UTF-8 sequence (continuation byte 10xxxxxx)
            while (end < lb.length && (uint8(lb[end]) & 0xC0) == 0x80) end++;
            out = string.concat(
                out,
                _lineTspan(fb, size, i, _xmlEscape(string(_slice(lb, pos, end))))
            );
            pos = end;
        }
    }

    /// @dev round(252 - (lines*round(1.2*size))/2 + 0.74*size): the y of line 0.
    function _firstBaseline(
        uint256 size,
        uint256 lines
    ) private pure returns (int256) {
        uint256 lineH = (size * 120 + 50) / 100; // round(size * 1.2)
        return
            (int256(252) *
                100 -
                int256(lines * lineH) *
                50 +
                int256(size) *
                74 +
                50) / 100;
    }

    function _lineTspan(
        int256 fb,
        uint256 size,
        uint256 i,
        string memory content
    ) private pure returns (string memory) {
        uint256 y = uint256(fb + int256(i * ((size * 120 + 50) / 100)));
        return
            string.concat(
                '<tspan x="250" y="',
                y.toString(),
                '">',
                content,
                "</tspan>"
            );
    }

    function _slice(
        bytes memory b,
        uint256 start,
        uint256 end
    ) internal pure returns (bytes memory r) {
        r = new bytes(end - start);
        for (uint256 i; i < r.length; i++) r[i] = b[start + i];
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
