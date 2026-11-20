// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

/// @title SHA512
/// @notice SHA-512, FIPS 180-4 section 6.4, in pure Solidity.
/// @dev There is no SHA-512 precompile and no implementation in `ens-contracts`. DNSSEC algorithm
///      10, RSASHA512 (RFC 5702), needs one: the RSA half already exists as `RSAVerify` and
///      `RSAPKCS1Verify`, and SHA-512 is the only missing piece.
///
///      Every arithmetic step is `unchecked`. SHA-512 is defined on addition modulo 2**64 and
///      Solidity 0.8 reverts on `uint64` overflow, so checked arithmetic would make the function
///      revert on ordinary input rather than wrap as the specification requires.
///
///      The round constants and the initial hash value are the first 64 bits of the fractional
///      parts of the cube roots and the square roots of the first 80 and first 8 primes. They were
///      generated rather than transcribed, and the generator asserts the published first and last
///      values before emitting them.
library SHA512 {
    /// @notice Hash of `data`.
    /// @param data The message.
    /// @return The 64 byte digest.
    function hash(bytes memory data) internal pure returns (bytes memory) {
        uint64[8] memory h = [
            0x6a09e667f3bcc908,
            0xbb67ae8584caa73b,
            0x3c6ef372fe94f82b,
            0xa54ff53a5f1d36f1,
            0x510e527fade682d1,
            0x9b05688c2b3e6c1f,
            0x1f83d9abfb41bd6b,
            0x5be0cd19137e2179
        ];

        uint64[80] memory k = _k();
        bytes memory m = _pad(data);
        uint64[80] memory w;

        for (uint256 off = 0; off < m.length; off += 128) {
            unchecked {
                for (uint256 i = 0; i < 16; i++) {
                    w[i] = _word(m, off + i * 8);
                }
                for (uint256 i = 16; i < 80; i++) {
                    uint64 s0 = _rotr(w[i - 15], 1) ^ _rotr(w[i - 15], 8) ^ (w[i - 15] >> 7);
                    uint64 s1 = _rotr(w[i - 2], 19) ^ _rotr(w[i - 2], 61) ^ (w[i - 2] >> 6);
                    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
                }

                _compress(h, w, k);
            }
        }

        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 8; i++) {
            uint64 v = h[i];
            for (uint256 j = 0; j < 8; j++) {
                out[i * 8 + j] = bytes1(uint8(v >> (56 - 8 * j)));
            }
        }
        return out;
    }

    /// @dev One application of the compression function, FIPS 180-4 section 6.4.2.
    ///      The eight working variables live in their own call frame. Holding them as locals in
    ///      `hash` alongside the schedule and the constant table put the IR pipeline two slots
    ///      over the stack limit.
    function _compress(uint64[8] memory h, uint64[80] memory w, uint64[80] memory k) private pure {
        unchecked {
            uint64[8] memory v = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];

            for (uint256 i = 0; i < 80; i++) {
                uint64 t1 = v[7] + (_rotr(v[4], 14) ^ _rotr(v[4], 18) ^ _rotr(v[4], 41)) +
                    ((v[4] & v[5]) ^ ((~v[4]) & v[6])) + k[i] + w[i];
                uint64 t2 = (_rotr(v[0], 28) ^ _rotr(v[0], 34) ^ _rotr(v[0], 39)) +
                    ((v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]));
                v[7] = v[6];
                v[6] = v[5];
                v[5] = v[4];
                v[4] = v[3] + t1;
                v[3] = v[2];
                v[2] = v[1];
                v[1] = v[0];
                v[0] = t1 + t2;
            }

            for (uint256 i = 0; i < 8; i++) {
                h[i] += v[i];
            }
        }
    }

    /// @dev FIPS 180-4 section 5.1.2. Append `0x80`, then zeros, then the length in bits as a
    ///      128 bit big-endian integer. Only the low 64 bits can be non-zero here, because a
    ///      `bytes` value cannot be long enough to need the rest.
    function _pad(bytes memory data) private pure returns (bytes memory) {
        uint256 len = data.length;
        uint256 total = len + 17; // 1 marker byte + 16 length bytes, at minimum
        uint256 padded = ((total + 127) / 128) * 128;
        bytes memory m = new bytes(padded);
        // A byte at a time, deliberately. `mcopy` is faster and does not compile for the
        // `paris` EVM version that `ens-contracts` targets. A word loop that `mload`s and
        // `mstore`s 32 bytes at a time is faster still and is **wrong**: it writes up to 31
        // bytes of source-adjacent memory past `len`, and those bytes are the zero padding
        // this function depends on. `m[len] = 0x80` repairs only byte `len`. Measured: a word
        // loop fails the SHA-512 differential test at lengths below 200.
        for (uint256 i = 0; i < len; i++) {
            m[i] = data[i];
        }
        m[len] = 0x80;
        uint256 bits = len * 8;
        for (uint256 j = 0; j < 8; j++) {
            m[padded - 1 - j] = bytes1(uint8(bits >> (8 * j)));
        }
        return m;
    }

    /// @dev Big-endian 64 bit word at `off`.
    function _word(bytes memory m, uint256 off) private pure returns (uint64 r) {
        unchecked {
            for (uint256 i = 0; i < 8; i++) {
                r = (r << 8) | uint64(uint8(m[off + i]));
            }
        }
    }

    /// @dev Rotate right. `uint64` shifts truncate to the type, so the two halves do not overlap.
    ///      `n` must be in `[1, 63]`; all ten call sites pass a FIPS 180-4 constant in that
    ///      range. `n >= 64` would return a wrong value rather than revert, because `64 - n`
    ///      is unchecked. The range is not asserted: this is the hottest loop in the library.
    function _rotr(uint64 x, uint64 n) private pure returns (uint64) {
        unchecked {
            return (x >> n) | (x << (64 - n));
        }
    }

    /// @dev The round constant table, built once per `hash` call. An earlier revision returned one
    ///      constant at a time from a function, which rebuilt the whole 80 word array on every one
    ///      of the 80 rounds of every block.
    function _k() private pure returns (uint64[80] memory K) {
        K = [
            0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f, 0xe9b5dba58189dbbc,
            0x3956c25bf348b538, 0x59f111f1b605d019, 0x923f82a4af194f9b, 0xab1c5ed5da6d8118,
            0xd807aa98a3030242, 0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2,
            0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235, 0xc19bf174cf692694,
            0xe49b69c19ef14ad2, 0xefbe4786384f25e3, 0xfc19dc68b8cd5b5, 0x240ca1cc77ac9c65,
            0x2de92c6f592b0275, 0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5,
            0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f, 0xbf597fc7beef0ee4,
            0xc6e00bf33da88fc2, 0xd5a79147930aa725, 0x6ca6351e003826f, 0x142929670a0e6e70,
            0x27b70a8546d22ffc, 0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df,
            0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6, 0x92722c851482353b,
            0xa2bfe8a14cf10364, 0xa81a664bbc423001, 0xc24b8b70d0f89791, 0xc76c51a30654be30,
            0xd192e819d6ef5218, 0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8,
            0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99, 0x34b0bcb5e19b48a8,
            0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb, 0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3,
            0x748f82ee5defb2fc, 0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec,
            0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915, 0xc67178f2e372532b,
            0xca273eceea26619c, 0xd186b8c721c0c207, 0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178,
            0x6f067aa72176fba, 0xa637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b,
            0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc, 0x431d67c49c100d4c,
            0x4cc5d4becb3e42b6, 0x597f299cfc657e2a, 0x5fcb6fab3ad6faec, 0x6c44198c4a475817
        ];
    }
}
