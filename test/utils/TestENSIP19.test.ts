import hre from 'hardhat'

import { dnsEncodeName } from '../fixtures/dnsEncodeName.js'
import {
  chainFromCoinType,
  COIN_TYPE_ETH,
  COIN_TYPE_DEFAULT,
  getReverseName,
  getReverseNamespace,
  isEVMCoinType,
  shortCoin,
} from '../fixtures/ensip19.js'

const addrs = [
  '0x81',
  '0x8000000000000000000000000000000000000001',
  '0x800000000000000000000000000000000000000000000000000000000000000001', // 33 bytes
] as const

const coinTypes = [
  COIN_TYPE_ETH,
  COIN_TYPE_DEFAULT,
  0n, // btc
  0x123n,
  COIN_TYPE_DEFAULT | 1n,
  0x1_8000_0123n, // 33 bits
]

const connection = await hre.network.connect()

async function fixture() {
  return connection.viem.deployContract('TestENSIP19')
}
const loadFixture = async () => connection.networkHelpers.loadFixture(fixture)

describe('ENSIP19', () => {
  describe('reverseName()', () => {
    it('empty', async () => {
      const F = await loadFixture()
      await expect(
        F.read.reverseName(['0x', COIN_TYPE_ETH]),
      ).toBeRevertedWithCustomError('EmptyAddress')
    })

    for (const addr of addrs) {
      it(addr, async () => {
        const F = await loadFixture()
        for (const coinType of coinTypes) {
          await expect(
            F.read.reverseName([addr, coinType]),
            shortCoin(coinType),
          ).resolves.toStrictEqual(getReverseName(addr, coinType))
        }
      })
    }
  })

  describe('parseNamespace()', () => {
    for (const coinType of coinTypes) {
      it(shortCoin(coinType), async () => {
        const F = await loadFixture()
        await expect(
          F.read.parseNamespace([
            dnsEncodeName(getReverseNamespace(coinType)),
            0n,
          ]),
          shortCoin(coinType),
        ).resolves.toStrictEqual([true, coinType])
      })
    }
  })

  describe('parse(reverseName(a, c)) == (a, c)', () => {
    for (const addr of addrs) {
      it(addr, async () => {
        const F = await loadFixture()
        for (const coinType of coinTypes) {
          await expect(
            F.read.parse([dnsEncodeName(getReverseName(addr, coinType))]),
            shortCoin(coinType),
          ).resolves.toStrictEqual([addr, coinType])
        }
      })
    }
  })

  describe('parse() errors', () => {
    for (const name of [
      '', // empty
      '1234', // only address
      'zzz', // only invalid address
      'reverse', // only tld
      'zzz.addr.reverse', // invalid address
      '.default.reverse', // empty address
      'abc.reverse', // no address
      '1234.addr', // no tld
      '1234.addr.eth', // invalid tld
      '1234.addr.reverse.eth', // not tld
    ]) {
      it(name || '<empty>', async () => {
        const F = await loadFixture()
        await expect(
          F.read.parse([dnsEncodeName(name)]),
        ).resolves.toStrictEqual(['0x', 0n])
      })
    }
  })

  describe('chainFromCoinType()', () => {
    for (const coinType of coinTypes) {
      it(shortCoin(coinType), async () => {
        const F = await loadFixture()
        await expect(
          F.read.chainFromCoinType([coinType]),
        ).resolves.toStrictEqual(chainFromCoinType(coinType))
      })
    }
  })

  describe('isEVMCoinType()', () => {
    for (const coinType of coinTypes) {
      it(shortCoin(coinType), async () => {
        const F = await loadFixture()
        await expect(F.read.isEVMCoinType([coinType])).resolves.toStrictEqual(
          isEVMCoinType(coinType),
        )
      })
    }
  })
})
