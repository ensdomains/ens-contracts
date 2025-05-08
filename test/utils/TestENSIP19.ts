import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import {
  chainFromCoinType,
  COIN_TYPE_ETH,
  EVM_BIT,
  getReverseName,
  isEVMCoinType,
  shortCoin,
} from '../fixtures/ensip19.js'
import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'

async function fixture() {
  return hre.viem.deployContract('TestENSIP19')
}

const addrs = [
  '0x81',
  '0x8000000000000000000000000000000000000001',
  '0x800000000000000000000000000000000000000000000000000000000000000001', // 33 bytes
] as const

const coinTypes = [COIN_TYPE_ETH, EVM_BIT, 0n, 1n]

describe('ENSIP19', () => {
  describe('reverseName()', () => {
    it('empty', async () => {
      const F = await loadFixture(fixture)
      await expect(F)
        .read('reverseName', ['0x', COIN_TYPE_ETH])
        .toBeRevertedWithCustomError('EmptyAddress')
    })

    for (const addr of addrs) {
      it(addr, async () => {
        const F = await loadFixture(fixture)
        for (const coinType of coinTypes) {
          await expect(
            F.read.reverseName([addr, coinType]),
            shortCoin(coinType),
          ).resolves.toStrictEqual(getReverseName(addr, coinType))
        }
      })
    }
  })

  describe('parse()', () => {
    for (const addr of addrs) {
      it(addr, async () => {
        const F = await loadFixture(fixture)
        for (const coinType of coinTypes) {
          await expect(
            F.read.parse([dnsEncodeName(getReverseName(addr, coinType))]),
            shortCoin(coinType),
          ).resolves.toStrictEqual([addr, coinType])
        }
      })
    }

    for (const name of [
      'zzz.addr.reverse',
      '.default.reverse',
      'abc.reverse',
    ]) {
      it(name, async () => {
        const F = await loadFixture(fixture)
        await expect(
          F.read.parse([dnsEncodeName(name)]),
        ).resolves.toStrictEqual(['0x', 0n])
      })
    }
  })

  describe('chainFromCoinType()', () => {
    for (const coinType of coinTypes) {
      it(shortCoin(coinType), async () => {
        const F = await loadFixture(fixture)
        await expect(
          F.read.chainFromCoinType([coinType]),
        ).resolves.toStrictEqual(chainFromCoinType(coinType))
      })
    }
  })

  describe('isEVMCoinType()', () => {
    for (const coinType of coinTypes) {
      it(shortCoin(coinType), async () => {
        const F = await loadFixture(fixture)
        await expect(F.read.isEVMCoinType([coinType])).resolves.toStrictEqual(
          isEVMCoinType(coinType),
        )
      })
    }
  })
})
