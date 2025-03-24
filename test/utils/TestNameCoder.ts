import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import { namehash, slice, toHex } from 'viem'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import { dnsDecodeName } from '../fixtures/dnsDecodeName.js'
import { getParentName } from '../universalResolver/utils.js'

async function fixture() {
  return hre.viem.deployContract('TestNameCoder', [])
}

describe('NameEncoder', () => {
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
        let pos = 0
        while (true) {
          await expect(
            F.read.namehash([dns, BigInt(pos)]),
            `namehash: ${ens}`,
          ).resolves.toStrictEqual(namehash(ens))
          if (!ens) break
          pos += 1 + parseInt(slice(dns, pos, pos + 1))
          ens = getParentName(ens)
        }
      })
    }
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
    for (const dns of ['0x', '0x02', '0x0000', '0x1000'] as const) {
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
  })

  it('malicious label', async () => {
    const F = await loadFixture(fixture)
    await expect(F)
      .read('decode', [toHex('\x03a.b\x00')])
      .toBeRevertedWithCustomError('DNSDecodingFailed')
  })
})
