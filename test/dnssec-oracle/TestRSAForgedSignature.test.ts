import hre from 'hardhat'
import { sha256, toHex, concat } from 'viem'

/**
 * Bleichenbacher RSA Signature Forgery Test
 *
 * Demonstrates that RSASHA256Algorithm.verify() rejects forged signatures
 * for RSA keys with low exponent (e=3) due to proper PKCS#1 v1.5 validation.
 */

const connection = await hre.network.connect()

// ============================================================================
// Crypto helpers (attack-specific, can't reuse from codebase)
// ============================================================================

/** Hensel lifting: find x where x³ ≡ h (mod 2^n) */
function cubeRootMod2n(h: bigint, n = 256): bigint {
  if (h % 2n === 0n) throw new Error('h must be odd')
  let x = 1n
  for (let i = 1; i < n; i++) {
    const mod = 2n ** BigInt(i + 1)
    const fx = (x ** 3n - h) % mod
    const fpx = (3n * x * x) % mod
    const fpxInv = modInverse(fpx, mod)
    x = ((x - fx * fpxInv) % mod + mod) % mod
  }
  return x
}

/** Extended Euclidean algorithm for modular inverse */
function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]
  while (r !== 0n) {
    const q = old_r / r
    ;[old_r, r] = [r, old_r - q * r]
    ;[old_s, s] = [s, old_s - q * s]
  }
  return ((old_s % m) + m) % m
}

/** Convert bigint to big-endian bytes */
function bigIntToBytes(n: bigint, len: number): Uint8Array {
  const hex = n.toString(16).padStart(len * 2, '0')
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// ============================================================================
// Test
// ============================================================================

describe('RSA Signature Forgery (Bleichenbacher Attack)', () => {
  it('should reject forged signature for e=3 key', async () => {
    const algorithm = await connection.viem.deployContract('RSASHA256Algorithm', [])

    // RSA key with e=3 (2048-bit modulus) - mimics .cc/.name KSK
    const modulusBytes = 256
    const modulusInt = BigInt('0x' + 'ff'.repeat(255) + '01')
    const modulus = bigIntToBytes(modulusInt, modulusBytes)
    const exponent = 3

    // Build DNSKEY format: flags(2) + protocol(1) + algo(1) + expLen(1) + exp + modulus
    const key = concat([
      new Uint8Array([0x01, 0x01, 0x03, 0x08, 0x01, exponent]),
      modulus,
    ])

    // Find data whose hash is odd (required for Hensel lifting)
    let data: Uint8Array
    let h: bigint = 0n
    for (let nonce = 0; nonce < 10000; nonce++) {
      data = new Uint8Array([nonce & 0xff])
      h = BigInt(sha256(data))
      if (h % 2n === 1n) break
    }

    const forgedSig = bigIntToBytes(cubeRootMod2n(h), modulusBytes)

    const isValid = await algorithm.read.verify([
      toHex(key),
      toHex(data!),
      toHex(forgedSig),
    ])

    console.log('Forged signature rejected:', !isValid)
    expect(isValid).toBe(false)
  })
})
