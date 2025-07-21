import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { stringToHex } from 'viem'

async function fixture() {
  return hre.viem.deployContract('TestStringUtils')
}

describe('StringUtils', () => {
  describe('escape', () => {
    it('double quote', async () => {
      const F = await loadFixture(fixture)
      await expect(
        F.read.escape(['My ENS is, "tanrikulu.eth"']),
      ).resolves.toEqual('My ENS is, \\"tanrikulu.eth\\"')
    })

    it('backslash', async () => {
      const F = await loadFixture(fixture)
      await expect(F.read.escape(['Path\\to\\file'])).resolves.toEqual(
        'Path\\\\to\\\\file',
      )
    })

    it('new line', async () => {
      const F = await loadFixture(fixture)
      await expect(F.read.escape(['Line 1\nLine 2'])).resolves.toEqual(
        'Line 1\\nLine 2',
      )
    })
  })

  describe('strlen', () => {
    for (const s of [
      '',
      'a',
      'aa',
      'aaa',
      'aaaa',
      'aaaaa',
      '⌚', // 1
      '🇺🇸', // 2
      '🍄‍🟫', // 3
      '👨🏻‍🌾', // 4
      '🧑‍🤝‍🧑', // 5
      '👨🏻‍🦯‍➡', // 6
      '🏴󠁧󠁢󠁥󠁮󠁧󠁿', // 7
      '👨🏻‍❤‍💋‍👨🏻', // 9
    ]) {
      const n = [...s].length
      it(`${s || '<empty>'} = ${n}`, async () => {
        const F = await loadFixture(fixture)
        await expect(F.read.strlen([s])).resolves.toStrictEqual(BigInt(n))
      })
    }
    for (const cp of [0, 0x80, 0x800, 0x10000, 0x10ffff]) {
      const s = String.fromCodePoint(cp)
      const n = [...s].length
      it(`${stringToHex(s)} = ${n}`, async () => {
        const F = await loadFixture(fixture)
        await expect(F.read.strlen([s])).resolves.toStrictEqual(BigInt(n))
      })
    }
  })
})
