import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { namehash, toHex, size, keccak256, stringToBytes } from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { dnsDecodeName } from '../fixtures/dnsDecodeName.js'

async function fixture() {
  return hre.viem.deployContract('TestNameCoder', [])
}

describe('NameCoder', () => {
  describe('valid', () => {
    for (let [title, ens] of [
      ['empty', ''],
      ['a.bb.ccc.dddd.eeeee'],
      ['1x255', '1'.repeat(255)],
      ['1x300', '1'.repeat(300)],
      [`[${'1'.repeat(64)}]`],
      ['mixed', `${'1'.repeat(300)}.[${'1'.repeat(64)}].eth`],
    ]) {
      ens ??= title
      it(title, async () => {
        const F = await loadFixture(fixture)
        const dns = dnsEncodeName(ens)
        await expect(F.read.encode([ens]), 'encode').resolves.toStrictEqual(dns)
        await expect(F.read.decode([dns]), 'decode').resolves.toStrictEqual(
          dnsDecodeName(dns),
        )
        await expect(
          F.read.namehash([dns, 0n]),
          'namehash',
        ).resolves.toStrictEqual(namehash(ens))
        for (let offset = 0n; offset < size(dns); ) {
          ;[, offset] = await F.read.nextLabel([dns, offset])
        }
        for (let offset = BigInt(size(dns)); offset; ) {
          offset = await F.read.prevLabel([dns, offset])
        }
      })
    }
  })

  it('no next label', async () => {
    const F = await loadFixture(fixture)
    await expect(F)
      .read('nextLabel', [dnsEncodeName(''), 1n])
      .toBeRevertedWithCustomError('DNSDecodingFailed')
  })

  describe('prevLabel()', () => {
    it('offset = name.length is <root>', async () => {
      const F = await loadFixture(fixture)
      const dns = dnsEncodeName('eth')
      const offset = BigInt(size(dns))
      const prev = offset - 1n
      await expect(
        F.read.prevLabel([dns, offset]),
        'prevLabel',
      ).resolves.toStrictEqual(prev)
      await expect(
        F.read.nextLabel([dns, prev]),
        'nextLabel',
      ).resolves.toStrictEqual([0n, offset])
    })

    it('offset = name.length-1 is <tld>', async () => {
      const F = await loadFixture(fixture)
      const namespace = 'a.b.c.'
      const tld = 'eth'
      const dns = dnsEncodeName(namespace + tld)
      const offset = BigInt(size(dns) - 1)
      const prev = BigInt(namespace.length)
      await expect(
        F.read.prevLabel([dns, offset]),
        'prevLabel',
      ).resolves.toStrictEqual(prev)
      await expect(
        F.read.readLabel([dns, prev, true]),
        'readLabel',
      ).resolves.toStrictEqual([keccak256(stringToBytes(tld)), false, offset])
    })

    it('offset = 0 reverts', async () => {
      const F = await loadFixture(fixture)
      await expect(F)
        .read('prevLabel', [dnsEncodeName(''), 0n])
        .toBeRevertedWithCustomError('DNSDecodingFailed')
    })
  })

  it('null hashed label', async () => {
    const F = await loadFixture(fixture)
    await expect(F)
      .read('readLabel', [dnsEncodeName(`[${'0'.repeat(64)}]`), 0n, true])
      .toBeRevertedWithCustomError('DNSDecodingFailed')
  })

  it('disable hashed label support', async () => {
    const F = await loadFixture(fixture)
    const label = `[${'0'.repeat(64)}]`
    await expect(
      F.read.readLabel([dnsEncodeName(label), 0n, false]),
    ).resolves.toStrictEqual([keccak256(stringToBytes(label)), false, 67n])
  })

  it('invalid hashed label', async () => {
    const F = await loadFixture(fixture)
    await expect(F)
      .read('namehash', [dnsEncodeName(`[${'z'.repeat(64)}]`), 0n])
      .toBeRevertedWithCustomError('DNSDecodingFailed')
  })

  describe('encode() failure', () => {
    for (const ens of ['.', '..', '.a', 'a.', 'a..b']) {
      it(ens, async () => {
        const F = await loadFixture(fixture)
        await expect(F)
          .read('encode', [ens])
          .toBeRevertedWithCustomError('DNSEncodingFailed')
      })
    }
  })

  describe('decode() failure', () => {
    for (const dns of ['0x', '0x02', '0x0000', '0x0100'] as const) {
      it(dns, async () => {
        const F = await loadFixture(fixture)
        await expect(F)
          .read('decode', [dns])
          .toBeRevertedWithCustomError('DNSDecodingFailed')
        await expect(F)
          .read('namehash', [dns, 0n])
          .toBeRevertedWithCustomError('DNSDecodingFailed')
      })
    }

    it('malicious label', async () => {
      const F = await loadFixture(fixture)
      await expect(F)
        .read('decode', [toHex('\x03a.b\x00')])
        .toBeRevertedWithCustomError('DNSDecodingFailed')
    })
  })
})
